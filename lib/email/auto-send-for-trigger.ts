import type { CampaignAppliedRow } from "@/lib/db/campaign-applied";
import type { QueryExecutor } from "@/lib/db/config/client";
import {
  cancelPendingSchedulesForCampaignApplied,
  createEmailSchedule,
} from "@/lib/db/email-schedules";
import { copyTemplateAttachmentsToMessage } from "@/lib/db/email-attachments";
import {
  createEmailMessage,
  updateEmailMessageStatus,
} from "@/lib/db/email-messages";
import { getEmailSettings, type EmailSettingsRow } from "@/lib/db/email-settings";
import { listActiveEmailTemplatesByTriggerType } from "@/lib/db/email-templates";
import type { PublicUserRow } from "@/lib/db/users";
import { composeEmailForCandidate } from "@/lib/email/compose-for-candidate";
import { composeSelfNotificationEmail } from "@/lib/email/compose-self-notification";
import { buildGraphAttachmentsForMessage } from "@/lib/email/message-attachments";
import { sendEmail } from "@/lib/email/send-email";
import { logApiError } from "@/lib/logger";

/**
 * Called after a pipeline stage transition commits (or as part of the same
 * transaction). First cancels any pending scheduled emails for this
 * application -- their trigger no longer applies once the candidate has
 * moved on to a different stage. Then, for every active `is_auto_send`
 * candidate-facing template matching the new trigger, either sends
 * immediately (`send_offset_minutes === 0`) or queues an `email_schedules`
 * row for later (fired by the `schedules/process` poller).
 */
export async function handlePipelineTransitionEmailTriggers(
  db: QueryExecutor,
  application: CampaignAppliedRow,
  triggerType: string | null,
): Promise<void> {
  await cancelPendingSchedulesForCampaignApplied(
    db,
    application.id,
    "Candidate status changed before the scheduled send.",
  );

  if (!triggerType) return;

  const templates = (
    await listActiveEmailTemplatesByTriggerType(db, triggerType)
  ).filter((t) => t.recipient_type === "candidate" && t.is_auto_send);
  if (templates.length === 0) return;

  const settings = await getEmailSettings(db);

  for (const template of templates) {
    if (template.send_offset_minutes !== 0) {
      const scheduledFor = new Date(
        Date.now() + template.send_offset_minutes * 60_000,
      );
      await createEmailSchedule(db, {
        jobId: application.job_id,
        campaignAppliedId: application.id,
        templateId: template.id,
        scheduledFor,
      });
      continue;
    }

    await sendAutoEmailNow(db, application, template, triggerType, settings);
  }
}

/**
 * Fires a single auto/scheduled email immediately -- shared by the
 * zero-offset path above and the due-schedules poller
 * (`schedules/process/route.ts`), which both need identical
 * compose→create-message→send→status-update behavior.
 */
export async function sendAutoEmailNow(
  db: QueryExecutor,
  application: CampaignAppliedRow,
  template: {
    id: string;
    subject_template: string;
    body_template: string;
    require_approval: boolean;
    default_cc: string | null;
    default_bcc: string | null;
  },
  triggerType: string,
  settings: Pick<
    EmailSettingsRow,
    "default_sender" | "company_name" | "signature_html" | "logo_url"
  >,
): Promise<{ messageId: string } | null> {
  const fromEmail = settings.default_sender;
  try {
    const composed = await composeEmailForCandidate(
      db,
      application,
      template.subject_template,
      template.body_template,
      {
        companyName: settings.company_name,
        signatureHtml: settings.signature_html,
        logoUrl: settings.logo_url,
      },
    );
    if (!composed || !composed.toEmail) return null;

    const message = await createEmailMessage(db, {
      campaignAppliedId: application.id,
      jobId: application.job_id,
      templateId: template.id,
      senderUserId: null,
      type: "auto",
      status: template.require_approval ? "pending_approval" : "sending",
      triggerType,
      fromEmail,
      toEmail: composed.toEmail,
      cc: template.default_cc,
      bcc: template.default_bcc,
      subject: composed.subject,
      bodyHtml: composed.bodyHtml,
    });

    await copyTemplateAttachmentsToMessage(db, message.id, template.id);

    if (template.require_approval) return { messageId: message.id };

    const graphAttachments = await buildGraphAttachmentsForMessage(db, message.id);
    const sendResult = await sendEmail({
      fromEmail,
      toEmail: composed.toEmail,
      cc: template.default_cc,
      bcc: template.default_bcc,
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
    } else {
      await updateEmailMessageStatus(db, message.id, {
        status: "failed",
        errorMessage: sendResult.error,
        incrementRetryCount: true,
      });
    }
    return { messageId: message.id };
  } catch (error) {
    logApiError("Auto-send email trigger failed", error, {
      campaignAppliedId: application.id,
      triggerType,
      templateId: template.id,
    });
    return null;
  }
}

/**
 * Fires every active `recipient_type: 'self'`, `is_auto_send` template
 * matching `triggerType` -- addressed to `recipient`'s own email rather than
 * a candidate's. Called right after a `users` row is created (admin-invited
 * or first-time SSO self-provisioning) for `user_account_created`; not tied
 * to any campaign/job, so `campaign_applied_id`/`job_id` are left null on the
 * resulting `email_messages` row. Swallows and logs errors -- a notification
 * failure must never block account creation.
 */
export async function sendSelfNotificationForTrigger(
  db: QueryExecutor,
  recipient: PublicUserRow,
  triggerType: string,
  actingUser?: { name?: string | null; email?: string | null; phone?: string | null } | null,
): Promise<void> {
  const templates = (
    await listActiveEmailTemplatesByTriggerType(db, triggerType)
  ).filter((t) => t.recipient_type === "self" && t.is_auto_send);
  if (templates.length === 0) return;

  const settings = await getEmailSettings(db);

  for (const template of templates) {
    try {
      const composed = composeSelfNotificationEmail(
        recipient,
        template.subject_template,
        template.body_template,
        {
          companyName: settings.company_name,
          signatureHtml: settings.signature_html,
          logoUrl: settings.logo_url,
          actingUser,
        },
      );
      if (!composed) continue;

      const message = await createEmailMessage(db, {
        campaignAppliedId: null,
        jobId: null,
        templateId: template.id,
        senderUserId: null,
        type: "auto",
        status: template.require_approval ? "pending_approval" : "sending",
        triggerType,
        fromEmail: settings.default_sender,
        toEmail: composed.toEmail,
        cc: template.default_cc,
        bcc: template.default_bcc,
        subject: composed.subject,
        bodyHtml: composed.bodyHtml,
      });

      await copyTemplateAttachmentsToMessage(db, message.id, template.id);

      if (template.require_approval) continue;

      const graphAttachments = await buildGraphAttachmentsForMessage(db, message.id);
      const sendResult = await sendEmail({
        fromEmail: settings.default_sender,
        toEmail: composed.toEmail,
        cc: template.default_cc,
        bcc: template.default_bcc,
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
      } else {
        await updateEmailMessageStatus(db, message.id, {
          status: "failed",
          errorMessage: sendResult.error,
          incrementRetryCount: true,
        });
      }
    } catch (error) {
      logApiError("Self-notification email trigger failed", error, {
        recipientUserId: recipient.id,
        triggerType,
        templateId: template.id,
      });
    }
  }
}
