import type { QueryExecutor } from "@/lib/db/config/client";
import { buildSetClause } from "@/lib/db/query-helpers";

export type CandidateScheduleStatus =
  | "Scheduled"
  | "Confirmed"
  | "Rescheduled"
  | "Canceled"
  | "Completed"
  | "NoShow";

export type CandidateScheduleMode = "online" | "office";

/** Statuses the Calendar shows; `Rescheduled` / `Canceled` rows are hidden. */
export const ACTIVE_SCHEDULE_STATUSES: CandidateScheduleStatus[] = [
  "Scheduled",
  "Confirmed",
  "Completed",
  "NoShow",
];

/** No `deleted_at` on this table — canceling a schedule is a status change (`Canceled`), not a soft-delete, and a reschedule creates a new row linked back via `rescheduled_from_id`. */
export type CandidateScheduleRow = {
  id: string;
  campaign_applied_id: string;
  job_stage_mapping_id: string | null;
  round_label: string | null;
  scheduled_at: Date;
  duration_minutes: number | null;
  location: string | null;
  status: CandidateScheduleStatus;
  rescheduled_from_id: string | null;
  created_by: string | null;
  mode: CandidateScheduleMode;
  meeting_link: string | null;
  note: string | null;
  cancel_reason: string | null;
  reschedule_reason: string | null;
  canceled_by: string | null;
  canceled_at: Date | null;
  /** End of the interview + 24h; maintained by create/update below. */
  evaluation_due_at: Date | null;
  /** Every assigned interviewer has declined. */
  no_interviewer_flag: boolean;
  soft_conflicts_acknowledged: boolean;
  created_at: Date;
  updated_at: Date;
};

export type CreateCandidateScheduleInput = {
  campaignAppliedId: string;
  jobStageMappingId?: string | null;
  roundLabel?: string | null;
  scheduledAt: string | Date;
  durationMinutes?: number | null;
  location?: string | null;
  status?: CandidateScheduleStatus;
  rescheduledFromId?: string | null;
  createdBy?: string | null;
  mode?: CandidateScheduleMode;
  meetingLink?: string | null;
  note?: string | null;
  rescheduleReason?: string | null;
  softConflictsAcknowledged?: boolean;
};

export type UpdateCandidateScheduleInput = {
  jobStageMappingId?: string | null;
  roundLabel?: string | null;
  scheduledAt?: string | Date;
  durationMinutes?: number | null;
  location?: string | null;
  status?: CandidateScheduleStatus;
  mode?: CandidateScheduleMode;
  meetingLink?: string | null;
  note?: string | null;
  cancelReason?: string | null;
  rescheduleReason?: string | null;
  canceledBy?: string | null;
  canceledAt?: string | Date | null;
  noInterviewerFlag?: boolean;
  softConflictsAcknowledged?: boolean;
};

export async function getCandidateScheduleById(
  db: QueryExecutor,
  id: string,
): Promise<CandidateScheduleRow | null> {
  const { rows } = await db.query<CandidateScheduleRow>(
    `SELECT * FROM candidate_schedules WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function listCandidateSchedulesByCampaignApplied(
  db: QueryExecutor,
  campaignAppliedId: string,
): Promise<CandidateScheduleRow[]> {
  const { rows } = await db.query<CandidateScheduleRow>(
    `SELECT * FROM candidate_schedules
     WHERE campaign_applied_id = $1
     ORDER BY scheduled_at DESC`,
    [campaignAppliedId],
  );
  return rows;
}

/**
 * Active sessions starting in `[from, to)`. With `profileIds`, only sessions
 * where one of them is an assigned interviewer (declined or not -- callers
 * decide how to show a declined seat).
 */
export async function listSchedulesInRange(
  db: QueryExecutor,
  from: string | Date,
  to: string | Date,
  profileIds?: string[],
): Promise<CandidateScheduleRow[]> {
  if (profileIds && profileIds.length === 0) return [];
  const byProfile = profileIds
    ? `AND EXISTS (
         SELECT 1 FROM candidate_schedule_interviewers csi
         WHERE csi.schedule_id = cs.id AND csi.profile_id = ANY($4::uuid[])
       )`
    : "";
  const { rows } = await db.query<CandidateScheduleRow>(
    `SELECT cs.* FROM candidate_schedules cs
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

export async function createCandidateSchedule(
  db: QueryExecutor,
  input: CreateCandidateScheduleInput,
): Promise<CandidateScheduleRow> {
  const { rows } = await db.query<CandidateScheduleRow>(
    `INSERT INTO candidate_schedules (
       campaign_applied_id, job_stage_mapping_id, round_label, scheduled_at,
       duration_minutes, location, status, rescheduled_from_id, created_by,
       mode, meeting_link, note, reschedule_reason, soft_conflicts_acknowledged,
       evaluation_due_at
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, COALESCE($7, 'Scheduled'), $8, $9,
       COALESCE($10, 'online'), $11, $12, $13, COALESCE($14, false),
       $4::timestamptz + make_interval(mins => COALESCE($5::int, 60)) + interval '24 hours'
     )
     RETURNING *`,
    [
      input.campaignAppliedId,
      input.jobStageMappingId ?? null,
      input.roundLabel ?? null,
      input.scheduledAt,
      input.durationMinutes ?? null,
      input.location ?? null,
      input.status ?? null,
      input.rescheduledFromId ?? null,
      input.createdBy ?? null,
      input.mode ?? null,
      input.meetingLink ?? null,
      input.note ?? null,
      input.rescheduleReason ?? null,
      input.softConflictsAcknowledged ?? null,
    ],
  );
  return rows[0];
}

export async function updateCandidateSchedule(
  db: QueryExecutor,
  id: string,
  patch: UpdateCandidateScheduleInput,
): Promise<CandidateScheduleRow | null> {
  const { clause, values } = buildSetClause(
    {
      job_stage_mapping_id: patch.jobStageMappingId,
      round_label: patch.roundLabel,
      scheduled_at: patch.scheduledAt,
      duration_minutes: patch.durationMinutes,
      location: patch.location,
      status: patch.status,
      mode: patch.mode,
      meeting_link: patch.meetingLink,
      note: patch.note,
      cancel_reason: patch.cancelReason,
      reschedule_reason: patch.rescheduleReason,
      canceled_by: patch.canceledBy,
      canceled_at: patch.canceledAt,
      no_interviewer_flag: patch.noInterviewerFlag,
      soft_conflicts_acknowledged: patch.softConflictsAcknowledged,
    },
    2,
  );
  if (!clause) return getCandidateScheduleById(db, id);

  // Keep the evaluation deadline (end + 24h) in step with a time change.
  // SET expressions see the pre-update row, so new values come in as params.
  let dueClause = "";
  if (patch.scheduledAt !== undefined || patch.durationMinutes !== undefined) {
    const at = values.length + 2;
    const start =
      patch.scheduledAt !== undefined ? `$${at}::timestamptz` : "scheduled_at";
    const mins =
      patch.durationMinutes !== undefined
        ? `COALESCE($${at + 1}::int, 60)`
        : "COALESCE(duration_minutes, 60)";
    dueClause = `, evaluation_due_at = ${start} + make_interval(mins => ${mins}) + interval '24 hours'`;
    values.push(patch.scheduledAt ?? null, patch.durationMinutes ?? null);
  }

  const { rows } = await db.query<CandidateScheduleRow>(
    `UPDATE candidate_schedules
     SET ${clause}${dueClause}, updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, ...values],
  );
  return rows[0] ?? null;
}

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

/** Records a decline; re-declining keeps the first `declined_at`. */
export async function declineScheduleInterviewer(
  db: QueryExecutor,
  scheduleId: string,
  profileId: string,
  reason: string | null,
): Promise<CandidateScheduleInterviewerRow | null> {
  const { rows } = await db.query<CandidateScheduleInterviewerRow>(
    `UPDATE candidate_schedule_interviewers
     SET declined_at = COALESCE(declined_at, now()), decline_reason = $3
     WHERE schedule_id = $1 AND profile_id = $2
     RETURNING *`,
    [scheduleId, profileId, reason],
  );
  return rows[0] ?? null;
}

export async function withdrawScheduleInterviewerDecline(
  db: QueryExecutor,
  scheduleId: string,
  profileId: string,
): Promise<CandidateScheduleInterviewerRow | null> {
  const { rows } = await db.query<CandidateScheduleInterviewerRow>(
    `UPDATE candidate_schedule_interviewers
     SET declined_at = NULL, decline_reason = NULL
     WHERE schedule_id = $1 AND profile_id = $2
     RETURNING *`,
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

const UPCOMING_STATUSES: CandidateScheduleStatus[] = ["Scheduled", "Confirmed"];

/** Scheduled/Confirmed sessions that have not started, for these applications. */
export async function listUpcomingActiveSchedulesForApplications(
  db: QueryExecutor,
  campaignAppliedIds: string[],
  now: Date = new Date(),
): Promise<CandidateScheduleRow[]> {
  if (campaignAppliedIds.length === 0) return [];
  const { rows } = await db.query<CandidateScheduleRow>(
    `SELECT * FROM candidate_schedules
     WHERE campaign_applied_id = ANY($1::uuid[])
       AND status = ANY($2::text[])
       AND scheduled_at > $3
     ORDER BY scheduled_at ASC`,
    [campaignAppliedIds, UPCOMING_STATUSES, now],
  );
  return rows;
}

/** Scheduled/Confirmed sessions that have not started, for any application of a job. */
export async function listUpcomingActiveSchedulesForJob(
  db: QueryExecutor,
  jobId: string,
  now: Date = new Date(),
): Promise<CandidateScheduleRow[]> {
  const { rows } = await db.query<CandidateScheduleRow>(
    `SELECT cs.* FROM candidate_schedules cs
     JOIN campaign_applied ca ON ca.id = cs.campaign_applied_id
     WHERE ca.job_id = $1
       AND cs.status = ANY($2::text[])
       AND cs.scheduled_at > $3
     ORDER BY cs.scheduled_at ASC`,
    [jobId, UPCOMING_STATUSES, now],
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
};

/**
 * Interviewer seats past their evaluation deadline that have not submitted,
 * have not declined, and have not been reminded yet.
 */
export async function listOverdueEvaluationSeats(
  db: QueryExecutor,
  now: Date = new Date(),
  limit = 500,
): Promise<OverdueEvaluationSeatRow[]> {
  const { rows } = await db.query<OverdueEvaluationSeatRow>(
    `SELECT csi.schedule_id, csi.profile_id, cs.campaign_applied_id, cs.round_label,
            cs.scheduled_at, cs.evaluation_due_at, c.name AS candidate_name
     FROM candidate_schedule_interviewers csi
     JOIN candidate_schedules cs ON cs.id = csi.schedule_id
     JOIN campaign_applied ca ON ca.id = cs.campaign_applied_id AND ca.deleted_at IS NULL
     JOIN candidates c ON c.id = ca.candidate_id
     WHERE cs.evaluation_due_at IS NOT NULL AND cs.evaluation_due_at < $1
       AND cs.status = ANY($2::text[])
       AND csi.evaluation_submitted_at IS NULL
       AND csi.declined_at IS NULL
       AND csi.overdue_notified_at IS NULL
     ORDER BY cs.evaluation_due_at ASC
     LIMIT $3`,
    [now, ["Scheduled", "Confirmed", "Completed"], limit],
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
