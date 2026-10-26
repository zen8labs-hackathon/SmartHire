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

/**
 * BR-INT-13: Scheduled/Confirmed sessions that have not started and belong to a
 * pipeline stage -- by the session's own stage mapping, else the application's
 * current one. Pass the stage id or its library code.
 */
export async function countUpcomingActiveSchedulesForStage(
  db: QueryExecutor,
  stage: { id: string } | { code: string },
  now: Date = new Date(),
): Promise<number> {
  const byId = "id" in stage;
  const { rows } = await db.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM candidate_schedules cs
     JOIN campaign_applied ca ON ca.id = cs.campaign_applied_id
     JOIN job_stage_mappings jsm
       ON jsm.id = COALESCE(cs.job_stage_mapping_id, ca.current_job_stage_mapping_id)
     JOIN pipeline_stages ps ON ps.id = jsm.pipeline_stage_id
     WHERE ${byId ? "ps.id = $1::uuid" : "ps.code = $1 AND ps.deleted_at IS NULL"}
       AND cs.status = ANY($2::text[])
       AND cs.scheduled_at > $3`,
    [byId ? stage.id : stage.code, UPCOMING_STATUSES, now],
  );
  return Number(rows[0]?.n ?? 0);
}

/** BR-INT-13 error shown when a stage still has upcoming interviews. */
export function upcomingInterviewsBlockMessage(count: number): string {
  return `${count} interview${count === 1 ? " is" : "s are"} still upcoming in this stage. Cancel or finish them first.`;
}

