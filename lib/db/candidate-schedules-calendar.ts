import type { QueryExecutor } from "@/lib/db/config/client";
import {
  ACTIVE_SCHEDULE_STATUSES,
  type CandidateScheduleRow,
  type CandidateScheduleStatus,
} from "@/lib/db/candidate-schedules-core";

export type CandidateScheduleInterviewerRow = {
  schedule_id: string;
  profile_id: string;
  created_at: Date;
  declined_at: Date | null;
  decline_reason: string | null;
  evaluation_submitted_at: Date | null;
  overdue_notified_at: Date | null;
};

export async function listScheduleInterviewers(
  db: QueryExecutor,
  scheduleId: string,
): Promise<CandidateScheduleInterviewerRow[]> {
  const { rows } = await db.query<CandidateScheduleInterviewerRow>(
    `SELECT * FROM candidate_schedule_interviewers WHERE schedule_id = $1`,
    [scheduleId],
  );
  return rows;
}

export async function listInterviewersForSchedules(
  db: QueryExecutor,
  scheduleIds: string[],
): Promise<CandidateScheduleInterviewerRow[]> {
  if (scheduleIds.length === 0) return [];
  const { rows } = await db.query<CandidateScheduleInterviewerRow>(
    `SELECT * FROM candidate_schedule_interviewers
     WHERE schedule_id = ANY($1::bigint[])
     ORDER BY schedule_id, created_at`,
    [scheduleIds],
  );
  return rows;
}

export async function addScheduleInterviewer(
  db: QueryExecutor,
  scheduleId: string,
  profileId: string,
): Promise<void> {
  await db.query(
    `INSERT INTO candidate_schedule_interviewers (schedule_id, profile_id)
     VALUES ($1, $2)
     ON CONFLICT (schedule_id, profile_id) DO NOTHING`,
    [scheduleId, profileId],
  );
}

export async function removeScheduleInterviewer(
  db: QueryExecutor,
  scheduleId: string,
  profileId: string,
): Promise<void> {
  await db.query(
    `DELETE FROM candidate_schedule_interviewers
     WHERE schedule_id = $1 AND profile_id = $2`,
    [scheduleId, profileId],
  );
}

/** Records a decline; null when the seat is missing or already declined (BR-06-01). */
export async function declineScheduleInterviewer(
  db: QueryExecutor,
  scheduleId: string,
  profileId: string,
  reason: string | null,
): Promise<CandidateScheduleInterviewerRow | null> {
  const { rows } = await db.query<CandidateScheduleInterviewerRow>(
    `UPDATE candidate_schedule_interviewers
     SET declined_at = now(), decline_reason = $3
     WHERE schedule_id = $1 AND profile_id = $2 AND declined_at IS NULL
     RETURNING *`,
    [scheduleId, profileId, reason],
  );
  return rows[0] ?? null;
}

/**
 * Clears a decline (BR-06-05). Null when there is no decline to withdraw or
 * a replacement — an interviewer added after the decline — already holds a
 * seat.
 */
export async function withdrawScheduleInterviewerDecline(
  db: QueryExecutor,
  scheduleId: string,
  profileId: string,
): Promise<CandidateScheduleInterviewerRow | null> {
  const { rows } = await db.query<CandidateScheduleInterviewerRow>(
    `UPDATE candidate_schedule_interviewers me
     SET declined_at = NULL, decline_reason = NULL
     WHERE me.schedule_id = $1 AND me.profile_id = $2 AND me.declined_at IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM candidate_schedule_interviewers other
         WHERE other.schedule_id = me.schedule_id AND other.profile_id <> me.profile_id
           AND other.created_at > me.declined_at
       )
     RETURNING me.*`,
    [scheduleId, profileId],
  );
  return rows[0] ?? null;
}

export async function setNoInterviewerFlag(
  db: QueryExecutor,
  scheduleId: string,
  flag: boolean,
): Promise<void> {
  await db.query(
    `UPDATE candidate_schedules
     SET no_interviewer_flag = $2, updated_at = now()
     WHERE id = $1`,
    [scheduleId, flag],
  );
}

/** Idempotent: keeps the first submission time. */
export async function markEvaluationSubmitted(
  db: QueryExecutor,
  scheduleId: string,
  profileId: string,
): Promise<void> {
  await db.query(
    `UPDATE candidate_schedule_interviewers
     SET evaluation_submitted_at = COALESCE(evaluation_submitted_at, now())
     WHERE schedule_id = $1 AND profile_id = $2`,
    [scheduleId, profileId],
  );
}

/**
 * Claims the overdue reminder for one interviewer seat. Returns `false` when
 * it was already sent, so concurrent sweeps notify at most once.
 */
export async function markOverdueNotified(
  db: QueryExecutor,
  scheduleId: string,
  profileId: string,
): Promise<boolean> {
  const { rows } = await db.query<{ schedule_id: string }>(
    `UPDATE candidate_schedule_interviewers
     SET overdue_notified_at = now()
     WHERE schedule_id = $1 AND profile_id = $2
       AND overdue_notified_at IS NULL
     RETURNING schedule_id`,
    [scheduleId, profileId],
  );
  return rows.length > 0;
}

/** A session row plus the job and candidate it belongs to (Calendar feed). */
export type CalendarScheduleRow = CandidateScheduleRow & {
  job_id: string | null;
  candidate_id: string;
  candidate_name: string | null;
};

/**
 * Active sessions starting in `[from, to)` joined to their application and
 * candidate. With `profileIds`, only sessions where one of them is an
 * assigned interviewer or the organizer.
 */
export async function listCalendarSessionsInRange(
  db: QueryExecutor,
  from: string | Date,
  to: string | Date,
  profileIds?: string[],
): Promise<CalendarScheduleRow[]> {
  if (profileIds && profileIds.length === 0) return [];
  const byProfile = profileIds
    ? `AND (cs.created_by = ANY($4::uuid[]) OR EXISTS (
         SELECT 1 FROM candidate_schedule_interviewers csi
         WHERE csi.schedule_id = cs.id AND csi.profile_id = ANY($4::uuid[])
       ))`
    : "";
  const { rows } = await db.query<CalendarScheduleRow>(
    `SELECT cs.*, ca.job_id, ca.candidate_id, c.name AS candidate_name
     FROM candidate_schedules cs
     JOIN campaign_applied ca ON ca.id = cs.campaign_applied_id AND ca.deleted_at IS NULL
     JOIN candidates c ON c.id = ca.candidate_id
     WHERE cs.scheduled_at >= $1 AND cs.scheduled_at < $2
       AND cs.status = ANY($3::text[])
       ${byProfile}
     ORDER BY cs.scheduled_at ASC`,
    profileIds
      ? [from, to, ACTIVE_SCHEDULE_STATUSES, profileIds]
      : [from, to, ACTIVE_SCHEDULE_STATUSES],
  );
  return rows;
}

export type OverdueEvaluationSeatRow = {
  schedule_id: string;
  profile_id: string;
  campaign_applied_id: string;
  round_label: string | null;
  scheduled_at: Date;
  evaluation_due_at: Date;
  candidate_name: string | null;
  created_by: string | null;
};

/**
 * Evaluation reminders only cover deadlines on/after this instant. Legacy
 * sessions were backfilled with a past evaluation_due_at and no submission, so
 * they must never be reminded. Set to the release date of the Calendar feature.
 */
export const OVERDUE_REMINDER_CUTOFF = new Date("2026-11-01T00:00:00Z");

/**
 * Interviewer seats past their evaluation deadline that have not submitted,
 * have not declined, and have not been reminded yet. Only deadlines at or
 * after `cutoff` are considered: legacy sessions were backfilled with a past
 * evaluation_due_at and no submission, so they must never be reminded.
 */
export async function listOverdueEvaluationSeats(
  db: QueryExecutor,
  cutoff: Date,
  now: Date = new Date(),
  limit = 500,
): Promise<OverdueEvaluationSeatRow[]> {
  const { rows } = await db.query<OverdueEvaluationSeatRow>(
    `SELECT csi.schedule_id, csi.profile_id, cs.campaign_applied_id, cs.round_label,
            cs.scheduled_at, cs.evaluation_due_at, cs.created_by, c.name AS candidate_name
     FROM candidate_schedule_interviewers csi
     JOIN candidate_schedules cs ON cs.id = csi.schedule_id
     JOIN campaign_applied ca ON ca.id = cs.campaign_applied_id AND ca.deleted_at IS NULL
     JOIN candidates c ON c.id = ca.candidate_id
     WHERE cs.evaluation_due_at IS NOT NULL AND cs.evaluation_due_at < $1
       AND cs.evaluation_due_at >= $4
       AND cs.status = ANY($2::text[])
       AND csi.evaluation_submitted_at IS NULL
       AND csi.declined_at IS NULL
       AND csi.overdue_notified_at IS NULL
     ORDER BY cs.evaluation_due_at ASC
     LIMIT $3`,
    [now, ["Scheduled", "Confirmed", "Completed"], limit, cutoff],
  );
  return rows;
}

/**
 * The viewer's seat on any non-canceled session of this application, or
 * null. `submitted` is true when they submitted an evaluation on any seat.
 */
export async function getInterviewerSeatForApplication(
  db: QueryExecutor,
  campaignAppliedId: string,
  profileId: string,
): Promise<{ submitted: boolean } | null> {
  const { rows } = await db.query<{ submitted: boolean }>(
    `SELECT bool_or(csi.evaluation_submitted_at IS NOT NULL) AS submitted
     FROM candidate_schedule_interviewers csi
     JOIN candidate_schedules cs ON cs.id = csi.schedule_id
     WHERE cs.campaign_applied_id = $1 AND csi.profile_id = $2
       AND cs.status <> 'Canceled'
     HAVING count(*) > 0`,
    [campaignAppliedId, profileId],
  );
  return rows[0] ? { submitted: !!rows[0].submitted } : null;
}

/**
 * BR-INT-07: the session an evaluation submission counts for -- the viewer's
 * most recent started seat on this application that is still open (not
 * declined, not submitted, session not canceled / rescheduled / no-show).
 */
export async function findOpenEvaluationSeatForApplication(
  db: QueryExecutor,
  campaignAppliedId: string,
  profileId: string,
  now: Date = new Date(),
): Promise<{ schedule_id: string; status: CandidateScheduleStatus } | null> {
  const { rows } = await db.query<{ schedule_id: string; status: CandidateScheduleStatus }>(
    `SELECT cs.id AS schedule_id, cs.status
     FROM candidate_schedule_interviewers csi
     JOIN candidate_schedules cs ON cs.id = csi.schedule_id
     WHERE cs.campaign_applied_id = $1 AND csi.profile_id = $2
       AND cs.status = ANY($3::text[])
       AND cs.scheduled_at <= $4
       AND csi.declined_at IS NULL
       AND csi.evaluation_submitted_at IS NULL
     ORDER BY cs.scheduled_at DESC
     LIMIT 1`,
    [campaignAppliedId, profileId, ["Scheduled", "Confirmed", "Completed"], now],
  );
  return rows[0] ?? null;
}

/** Non-declined seats on a session that have not submitted an evaluation yet. */
export async function countPendingEvaluationSeats(
  db: QueryExecutor,
  scheduleId: string,
): Promise<number> {
  const { rows } = await db.query<{ n: string }>(
    `SELECT count(*)::text AS n
     FROM candidate_schedule_interviewers
     WHERE schedule_id = $1 AND declined_at IS NULL AND evaluation_submitted_at IS NULL`,
    [scheduleId],
  );
  return Number(rows[0]?.n ?? 0);
}
