import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { syncScheduleCalendarEvent } from "@/lib/calendar/sync-schedule";
import { listRetryableCalendarSyncs } from "@/lib/db/candidate-schedule-calendar-syncs";
import { getCandidateScheduleById } from "@/lib/db/candidate-schedules";
import { getPool } from "@/lib/db/config/client";
import { logApiError } from "@/lib/logger";

const MAX_RETRY_COUNT = 3;

/**
 * Polls `candidate_schedule_calendar_syncs` for `failed` rows still under
 * the retry cap and re-attempts each one. No cron/worker is wired up yet --
 * same shape as `app/api/admin/email/schedules/process/route.ts`, meant to
 * be hit by an external scheduler (or manually) until one exists.
 */
export async function POST(request: Request) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const db = getPool();
  const retryable = await listRetryableCalendarSyncs(db, MAX_RETRY_COUNT);

  let processed = 0;
  let skipped = 0;

  for (const sync of retryable) {
    try {
      const schedule = await getCandidateScheduleById(db, sync.schedule_id);
      if (!schedule) {
        skipped++;
        continue;
      }
      await syncScheduleCalendarEvent(db, schedule);
      processed++;
    } catch (error) {
      logApiError("Failed to process retryable calendar sync", error, {
        syncId: sync.id,
        scheduleId: sync.schedule_id,
      });
    }
  }

  return Response.json({ retryable: retryable.length, processed, skipped });
}
