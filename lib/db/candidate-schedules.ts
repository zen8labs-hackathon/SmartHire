import type { QueryExecutor } from "@/lib/db/config/client";
import { buildSetClause } from "@/lib/db/query-helpers";

export type CandidateScheduleStatus =
  | "Scheduled"
  | "Confirmed"
  | "Rescheduled"
  | "Canceled"
  | "Completed"
  | "NoShow";

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
};

export type UpdateCandidateScheduleInput = {
  jobStageMappingId?: string | null;
  roundLabel?: string | null;
  scheduledAt?: string | Date;
  durationMinutes?: number | null;
  location?: string | null;
  status?: CandidateScheduleStatus;
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

export async function createCandidateSchedule(
  db: QueryExecutor,
  input: CreateCandidateScheduleInput,
): Promise<CandidateScheduleRow> {
  const { rows } = await db.query<CandidateScheduleRow>(
    `INSERT INTO candidate_schedules (
       campaign_applied_id, job_stage_mapping_id, round_label, scheduled_at,
       duration_minutes, location, status, rescheduled_from_id, created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'Scheduled'), $8, $9)
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
    },
    2,
  );
  if (!clause) return getCandidateScheduleById(db, id);

  const { rows } = await db.query<CandidateScheduleRow>(
    `UPDATE candidate_schedules
     SET ${clause}, updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, ...values],
  );
  return rows[0] ?? null;
}

export type InterviewerRsvpStatus = "none" | "accepted" | "declined" | "tentative";

export type CandidateScheduleInterviewerRow = {
  schedule_id: string;
  profile_id: string;
  rsvp_status: InterviewerRsvpStatus;
  created_at: Date;
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

/** Bulk lookup for the timeline GET route -- one query for every schedule's interviewers instead of one per row. */
export async function listInterviewersByScheduleIds(
  db: QueryExecutor,
  scheduleIds: string[],
): Promise<CandidateScheduleInterviewerRow[]> {
  if (scheduleIds.length === 0) return [];
  const { rows } = await db.query<CandidateScheduleInterviewerRow>(
    `SELECT * FROM candidate_schedule_interviewers WHERE schedule_id = ANY($1::bigint[])`,
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

/** Carries interviewers over from a rescheduled row to its replacement in one INSERT...SELECT (no per-interviewer round trip). Used by the reschedule path in timeline/route.ts so changing the time doesn't silently drop the assigned interviewers. */
export async function copyScheduleInterviewers(
  db: QueryExecutor,
  fromScheduleId: string,
  toScheduleId: string,
): Promise<void> {
  await db.query(
    `INSERT INTO candidate_schedule_interviewers (schedule_id, profile_id)
     SELECT $2, profile_id FROM candidate_schedule_interviewers WHERE schedule_id = $1
     ON CONFLICT (schedule_id, profile_id) DO NOTHING`,
    [fromScheduleId, toScheduleId],
  );
}
