import { z } from "zod";

import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requirePermissionOnJob } from "@/lib/authz/require-permission";
import { listCampaignAppliedByIds } from "@/lib/db/campaign-applied";
import { getPool, withTransaction } from "@/lib/db/config/client";
import {
  copyTemplateAttachmentsToMessage,
  createEmailAttachments,
} from "@/lib/db/email-attachments";
import {
  createEmailMessage,
  updateEmailMessageStatus,
} from "@/lib/db/email-messages";
import { getEmailSettings } from "@/lib/db/email-settings";
import { getEmailTemplateById } from "@/lib/db/email-templates";
import { getPublicUserById } from "@/lib/db/users";
import { composeEmailForCandidate } from "@/lib/email/compose-for-candidate";
import { buildGraphAttachmentsForMessage } from "@/lib/email/message-attachments";
import { sendEmail } from "@/lib/email/send-email";
import { logApiError } from "@/lib/logger";

const attachmentSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  storagePath: z.string().min(1),
  fileSize: z.number().int().positive(),
});

const bodySchema = z
  .object({
    campaignAppliedIds: z.array(z.string().uuid()).min(1).max(100),
    templateId: z.string().regex(/^\d+$/).optional(),
    subject: z.string().optional(),
    bodyHtml: z.string().optional(),
    cc: z.string().nullable().optional(),
    bcc: z.string().nullable().optional(),
    attachments: z.array(attachmentSchema).max(10).optional(),
  })
  .refine((v) => v.templateId || (v.subject && v.bodyHtml), {
    message: "Either templateId or subject+bodyHtml is required.",
  });

/**
 * Manual send, single or bulk (Candidate Detail compose + per-job pipeline
 * bulk-send both call this). Recipients are processed sequentially rather
 * than with Promise.all so one failure doesn't abort the rest of the batch
 * -- this loop is also the structural hook for real send-rate limiting once
 * Microsoft Graph sending goes live (see lib/email/send-email.ts).
 */
export async function POST(request: Request) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }
  const {
    campaignAppliedIds,
    templateId,
    subject,
    bodyHtml,
    cc,
    bcc,
    attachments,
  } = parsed.data;

  const db = getPool();

  const template = templateId ? await getEmailTemplateById(db, templateId) : null;
  if (templateId && !template) {
    return Response.json({ error: "Template not found." }, { status: 404 });
  }

  const subjectTemplate = subject ?? template?.subject_template ?? "";
  const bodyTemplateText = bodyHtml ?? template?.body_template ?? "";
  const effectiveCc = cc ?? template?.default_cc ?? null;
  const effectiveBcc = bcc ?? template?.default_bcc ?? null;
  const requireApproval = template?.require_approval ?? false;

  const applications = await listCampaignAppliedByIds(db, campaignAppliedIds);
  if (applications.length !== campaignAppliedIds.length) {
    return Response.json(
      { error: "One or more candidates were not found." },
      { status: 404 },
    );
  }

  const jobIds = [
    ...new Set(applications.map((a) => a.job_id).filter((id): id is string => !!id)),
  ];
  for (const jobId of jobIds) {
    const access = await requirePermissionOnJob(auth.access, "candidate.manage", jobId);
    if (!access.ok) return access.response;
  }

  const settings = await getEmailSettings(db);
  const senderUserRow = await getPublicUserById(db, auth.userId);
  const senderUser = senderUserRow
    ? {
        name: senderUserRow.display_name || senderUserRow.username,
        email: senderUserRow.email,
        phone: senderUserRow.phone,
      }
    : null;

  const results: Array<{
    campaignAppliedId: string;
    ok: boolean;
    status?: string;
    messageId?: string;
    error?: string;
    simulated?: boolean;
  }> = [];

  // Each recipient gets its own try/catch (matching the pattern already used
  // by the auto-send path in lib/email/auto-send-for-trigger.ts) -- a DB or
  // Graph error for one candidate must not abort the rest of the batch, per
  // this route's own doc comment above. Wrapping the whole loop in a single
  // try/catch (the previous shape) broke that guarantee: any thrown error
  // -- not just an explicit `sendResult.ok === false` -- aborted every
  // recipient after the failing one.
  for (const application of applications) {
    try {
      const composed = await composeEmailForCandidate(
        db,
        application,
        subjectTemplate,
        bodyTemplateText,
        {
          senderName: auth.access.email,
          companyName: settings.company_name,
          // No signatureHtml here -- the compose modal already embeds the
          // signature into the editable body it sends as `bodyHtml`, so
          // appending it again here would duplicate it.
          logoUrl: settings.logo_url,
          senderUser,
        },
      );
      if (!composed || !composed.toEmail) {
        results.push({
          campaignAppliedId: application.id,
          ok: false,
          error: "Candidate has no email on file.",
        });
        continue;
      }
      const toEmail = composed.toEmail;

      // The message row and its attachments must land together -- without a
      // transaction, an attachment-insert failure would leave a message row
      // stuck in "sending" with no attachments and no way to retry the copy.
      const message = await withTransaction(async (tx) => {
        const message = await createEmailMessage(tx, {
          campaignAppliedId: application.id,
          jobId: application.job_id,
          templateId: templateId ?? null,
          senderUserId: auth.userId,
          type: "manual",
          status: requireApproval ? "pending_approval" : "sending",
          triggerType: template?.trigger_type ?? null,
          fromEmail: settings.default_sender,
          toEmail,
          cc: effectiveCc,
          bcc: effectiveBcc,
          subject: composed.subject,
          bodyHtml: composed.bodyHtml,
        });

        if (templateId) {
          await copyTemplateAttachmentsToMessage(tx, message.id, templateId);
        }
        if (attachments) {
          await createEmailAttachments(tx, message.id, attachments);
        }
        return message;
      });

      if (requireApproval) {
        results.push({
          campaignAppliedId: application.id,
          ok: true,
          status: "pending_approval",
          messageId: message.id,
        });
        continue;
      }

      // Deliberately outside the transaction above -- this is a network call
      // to Microsoft Graph, and holding a DB transaction open for the
      // duration of an external request would tie up a pool connection
      // (and an email that's actually been sent can't be "rolled back").
      const graphAttachments = await buildGraphAttachmentsForMessage(db, message.id);
      const sendResult = await sendEmail({
        fromEmail: settings.default_sender,
        toEmail,
        cc: effectiveCc,
        bcc: effectiveBcc,
        subject: composed.subject,
        bodyHtml: composed.bodyHtml,
        attachments: graphAttachments,
      });

      if (sendResult.ok) {
        await updateEmailMessageStatus(db, message.id, {
          status: "sent",
          sentAt: new Date(),
          graphMessageId: sendResult.graphMessageId,
        });
        results.push({
          campaignAppliedId: application.id,
          ok: true,
          status: "sent",
          messageId: message.id,
          simulated: sendResult.simulated,
        });
      } else {
        await updateEmailMessageStatus(db, message.id, {
          status: "failed",
          errorMessage: sendResult.error,
          incrementRetryCount: true,
        });
        results.push({
          campaignAppliedId: application.id,
          ok: false,
          status: "failed",
          messageId: message.id,
          error: sendResult.error,
        });
      }
    } catch (error) {
      logApiError("Email send failed for one recipient", error, {
        campaignAppliedId: application.id,
        templateId,
      });
      results.push({
        campaignAppliedId: application.id,
        ok: false,
        error: error instanceof Error ? error.message : "Failed to send email.",
      });
    }
  }

  return Response.json({ results });
}
