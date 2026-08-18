import type { QueryExecutor } from "@/lib/db/config/client";

export type CalendarSyncStatus = "pending" | "synced" | "failed" | "cancelled";

/** One row per `candidate_schedules` -- tracks the single Graph calendar event created for that schedule (application-permission flow, see lib/microsoft/calendar.ts). Not business data, so kept out of candidate_schedules itself -- mirrors the email_messages/email_schedules sync-state pattern. */
export type CandidateScheduleCalendarSyncRow = {
  id: string;
  schedule_id: string;
  graph_event_id: string | null;
  status: CalendarSyncStatus;
  error_message: string | null;
  retry_count: number;
  created_at: Date;
  updated_at: Date;
};

export async function getCalendarSyncByScheduleId(
  db: QueryExecutor,
  scheduleId: string,
): Promise<CandidateScheduleCalendarSyncRow | null> {
  const { rows } = await db.query<CandidateScheduleCalendarSyncRow>(
    `SELECT * FROM candidate_schedule_calendar_syncs WHERE schedule_id = $1`,
    [scheduleId],
  );
  return rows[0] ?? null;
}

/** Bulk lookup for the timeline GET route -- avoids one query per schedule row. */
export async function listCalendarSyncsByScheduleIds(
  db: QueryExecutor,
  scheduleIds: string[],
): Promise<CandidateScheduleCalendarSyncRow[]> {
  if (scheduleIds.length === 0) return [];
  const { rows } = await db.query<CandidateScheduleCalendarSyncRow>(
    `SELECT * FROM candidate_schedule_calendar_syncs WHERE schedule_id = ANY($1::bigint[])`,
    [scheduleIds],
  );
  return rows;
}

/**
 * Inserts (or resets, if a prior attempt exists) the `pending` row before
 * calling Graph -- keeps intent recorded even if the process crashes
 * mid-request. `ON CONFLICT` handles the reschedule-retry case where a sync
 * row for this schedule_id already exists (e.g. a previous `failed` attempt).
 */
export async function createCalendarSyncPending(
  db: QueryExecutor,
  scheduleId: string,
): Promise<CandidateScheduleCalendarSyncRow> {
  const { rows } = await db.query<CandidateScheduleCalendarSyncRow>(
    `INSERT INTO candidate_schedule_calendar_syncs (schedule_id, status)
     VALUES ($1, 'pending')
     ON CONFLICT (schedule_id) DO UPDATE SET status = 'pending', updated_at = now()
     RETURNING *`,
    [scheduleId],
  );
  return rows[0];
}

export async function markCalendarSyncSuccess(
  db: QueryExecutor,
  id: string,
  input: { graphEventId: string; warning?: string | null },
): Promise<void> {
  await db.query(
    `UPDATE candidate_schedule_calendar_syncs
     SET status = 'synced', graph_event_id = $2, error_message = $3, updated_at = now()
     WHERE id = $1`,
    [id, input.graphEventId, input.warning ?? null],
  );
}

export async function markCalendarSyncFailed(
  db: QueryExecutor,
  id: string,
  errorMessage: string,
): Promise<void> {
  await db.query(
    `UPDATE candidate_schedule_calendar_syncs
     SET status = 'failed', error_message = $2, retry_count = retry_count + 1, updated_at = now()
     WHERE id = $1`,
    [id, errorMessage],
  );
}

export async function markCalendarSyncCancelled(
  db: QueryExecutor,
  scheduleId: string,
): Promise<void> {
  await db.query(
    `UPDATE candidate_schedule_calendar_syncs
     SET status = 'cancelled', updated_at = now()
     WHERE schedule_id = $1 AND status != 'cancelled'`,
    [scheduleId],
  );
}

/** Drives the retry poller -- `failed` rows under the retry cap, oldest first. */
export async function listRetryableCalendarSyncs(
  db: QueryExecutor,
  maxRetryCount: number,
): Promise<CandidateScheduleCalendarSyncRow[]> {
  const { rows } = await db.query<CandidateScheduleCalendarSyncRow>(
    `SELECT * FROM candidate_schedule_calendar_syncs
     WHERE status = 'failed' AND retry_count < $1
     ORDER BY updated_at ASC`,
    [maxRetryCount],
  );
  return rows;
}
