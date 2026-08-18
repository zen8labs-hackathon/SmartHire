import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { getCampaignAppliedById } from "@/lib/db/campaign-applied";
import { getPool } from "@/lib/db/config/client";
import {
  claimEmailSchedule,
  linkEmailScheduleMessage,
  listDueEmailSchedules,
} from "@/lib/db/email-schedules";
import { getEmailSettings } from "@/lib/db/email-settings";
import { getEmailTemplateById } from "@/lib/db/email-templates";
import { sendAutoEmailNow } from "@/lib/email/auto-send-for-trigger";
import { logApiError } from "@/lib/logger";

/**
 * Polls `email_schedules` for due, still-pending rows and fires each one.
 * No cron/worker process is wired up in this pass -- this is meant to be
 * hit by an external scheduler (or manually) until one exists. Idempotent:
 * `completeEmailSchedule`'s `WHERE status = 'pending'` guard means firing
 * this twice for the same due window only ever sends each schedule once.
 */
export async function POST(request: Request) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const db = getPool();
  const due = await listDueEmailSchedules(db);
  const settings = await getEmailSettings(db);

  let processed = 0;
  let skipped = 0;

  for (const schedule of due) {
    try {
      // Claim first: only one concurrent caller can flip status 'pending' ->
      // 'completed' for a given row, so a second poll invocation naturally
      // no-ops here instead of double-sending.
      const claimed = await claimEmailSchedule(db, schedule.id);
      if (!claimed) {
        skipped++;
        continue;
      }

      if (!schedule.campaign_applied_id) continue;
      const application = await getCampaignAppliedById(
        db,
        schedule.campaign_applied_id,
      );
      if (!application) continue;

      const template = await getEmailTemplateById(db, schedule.template_id);
      if (!template) continue;

      const result = await sendAutoEmailNow(
        db,
        application,
        template,
        template.trigger_type,
        settings,
      );
      if (result) {
        await linkEmailScheduleMessage(db, schedule.id, result.messageId);
      }
      processed++;
    } catch (error) {
      logApiError("Failed to process due email schedule", error, {
        scheduleId: schedule.id,
      });
    }
  }

  return Response.json({ due: due.length, processed, skipped });
}
