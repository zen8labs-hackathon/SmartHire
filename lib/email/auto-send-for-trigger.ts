import type { CampaignAppliedRow } from "@/lib/db/campaign-applied";
import type { QueryExecutor } from "@/lib/db/config/client";
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
import { findUnresolvedPlaceholders } from "@/lib/email/render-template";
import { sendEmail } from "@/lib/email/send-email";
import { getRecipientTypeForTrigger } from "@/lib/email/trigger-types";
import { logApiError } from "@/lib/logger";

/**
 * Fires a single auto/scheduled candidate email immediately -- used by the
 * due-schedules poller (`schedules/process/route.ts`) for rows created via
 * `POST /api/admin/email/schedules` (the manual "send later" flow). There is
 * currently no trigger-based auto-send dispatcher wired up to pipeline
 * transitions; that's expected to be reintroduced as explicit per-trigger
 * functions rather than a generic recipient-type-filtered dispatcher.
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
    "default_sender" | "company_name" | "layout_type" | "custom_layout_html" | "logo_url"
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
        layoutType: settings.layout_type,
        customLayoutHtml: settings.custom_layout_html,
        logoUrl: settings.logo_url,
      },
    );
    if (!composed || !composed.toEmail) return null;

    // Hard-blocks an auto-send that would deliver literal, unrendered
    // `{{...}}` text -- a typo'd placeholder name, or per-recipient data
    // (e.g. an interview schedule) that isn't actually set yet. There's no
    // interactive preview step for auto-sends, so this is the only guard.
    const unresolved = findUnresolvedPlaceholders(`${composed.subject}\n${composed.bodyHtml}`);

    const message = await createEmailMessage(db, {
      campaignAppliedId: application.id,
      jobId: application.job_id,
      templateId: template.id,
      senderUserId: null,
      type: "auto",
      status: unresolved.length > 0 ? "failed" : template.require_approval ? "pending_approval" : "sending",
      triggerType,
      fromEmail,
      toEmail: composed.toEmail,
      cc: template.default_cc,
      bcc: template.default_bcc,
      subject: composed.subject,
      bodyHtml: composed.bodyHtml,
    });

    await copyTemplateAttachmentsToMessage(db, message.id, template.id);

    if (unresolved.length > 0) {
      await updateEmailMessageStatus(db, message.id, {
        status: "failed",
        errorMessage: `Unresolved variables: ${unresolved.join(", ")}`,
      });
      logApiError(
        "Auto-send email blocked -- unresolved placeholders",
        new Error(unresolved.join(", ")),
        { campaignAppliedId: application.id, triggerType, templateId: template.id },
      );
      return { messageId: message.id };
    }

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
 * Fires every active, `is_auto_send` template whose trigger resolves to a
 * "self" audience (`getRecipientTypeForTrigger`, see lib/email/trigger-types.ts)
 * and matches `triggerType` -- addressed to `recipient`'s own email rather
 * than a candidate's. Called right after a `users` row is created
 * (admin-invited or first-time SSO self-provisioning) for
 * `user_account_created`; not tied to any campaign/job, so
 * `campaign_applied_id`/`job_id` are left null on the resulting
 * `email_messages` row. Swallows and logs errors -- a notification failure
 * must never block account creation.
 */
export async function sendSelfNotificationForTrigger(
  db: QueryExecutor,
  recipient: PublicUserRow,
  triggerType: string,
  actingUser?: { name?: string | null; email?: string | null; phone?: string | null } | null,
): Promise<void> {
  const templates = (
    await listActiveEmailTemplatesByTriggerType(db, triggerType)
  ).filter((t) => getRecipientTypeForTrigger(t.trigger_type) === "self" && t.is_auto_send);
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
          layoutType: settings.layout_type,
          customLayoutHtml: settings.custom_layout_html,
          logoUrl: settings.logo_url,
          actingUser,
        },
      );
      if (!composed) continue;

      const unresolved = findUnresolvedPlaceholders(`${composed.subject}\n${composed.bodyHtml}`);

      const message = await createEmailMessage(db, {
        campaignAppliedId: null,
        jobId: null,
        templateId: template.id,
        senderUserId: null,
        type: "auto",
        status: unresolved.length > 0 ? "failed" : template.require_approval ? "pending_approval" : "sending",
        triggerType,
        fromEmail: settings.default_sender,
        toEmail: composed.toEmail,
        cc: template.default_cc,
        bcc: template.default_bcc,
        subject: composed.subject,
        bodyHtml: composed.bodyHtml,
      });

      await copyTemplateAttachmentsToMessage(db, message.id, template.id);

      if (unresolved.length > 0) {
        await updateEmailMessageStatus(db, message.id, {
          status: "failed",
          errorMessage: `Unresolved variables: ${unresolved.join(", ")}`,
        });
        logApiError(
          "Self-notification email blocked -- unresolved placeholders",
          new Error(unresolved.join(", ")),
          { recipientUserId: recipient.id, triggerType, templateId: template.id },
        );
        continue;
      }

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
