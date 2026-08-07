import type { QueryExecutor } from "@/lib/db/config/client";

export type EmailScheduleStatus = "pending" | "completed" | "cancelled";

export type EmailScheduleRow = {
  id: string;
  email_message_id: string | null;
  job_id: string | null;
  campaign_applied_id: string | null;
  template_id: string;
  scheduled_for: Date;
  status: EmailScheduleStatus;
  cancel_reason: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

export type CreateEmailScheduleInput = {
  jobId?: string | null;
  campaignAppliedId?: string | null;
  templateId: string;
  scheduledFor: Date | string;
  createdBy?: string | null;
};

export async function getEmailScheduleById(
  db: QueryExecutor,
  id: string,
): Promise<EmailScheduleRow | null> {
  const { rows } = await db.query<EmailScheduleRow>(
    `SELECT * FROM email_schedules WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/** Returns `null` when an identical schedule (same candidate/template/time) already exists -- the `ON CONFLICT DO NOTHING` is the idempotency guard against double-scheduling. */
export async function createEmailSchedule(
  db: QueryExecutor,
  input: CreateEmailScheduleInput,
): Promise<EmailScheduleRow | null> {
  const { rows } = await db.query<EmailScheduleRow>(
    `INSERT INTO email_schedules (job_id, campaign_applied_id, template_id, scheduled_for, created_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (campaign_applied_id, template_id, scheduled_for) DO NOTHING
     RETURNING *`,
    [
      input.jobId ?? null,
      input.campaignAppliedId ?? null,
      input.templateId,
      input.scheduledFor,
      input.createdBy ?? null,
    ],
  );
  return rows[0] ?? null;
}

/** Rows due to fire, oldest first -- drives the poller in `schedules/process/route.ts`. */
export async function listDueEmailSchedules(
  db: QueryExecutor,
  now: Date = new Date(),
): Promise<EmailScheduleRow[]> {
  const { rows } = await db.query<EmailScheduleRow>(
    `SELECT * FROM email_schedules
     WHERE status = 'pending' AND scheduled_for <= $1
     ORDER BY scheduled_for ASC`,
    [now],
  );
  return rows;
}

export async function listPendingSchedulesForCampaignApplied(
  db: QueryExecutor,
  campaignAppliedId: string,
): Promise<EmailScheduleRow[]> {
  const { rows } = await db.query<EmailScheduleRow>(
    `SELECT * FROM email_schedules
     WHERE campaign_applied_id = $1 AND status = 'pending'
     ORDER BY scheduled_for ASC`,
    [campaignAppliedId],
  );
  return rows;
}

/**
 * Atomically flips a pending schedule to `completed` -- `WHERE status =
 * 'pending'` is the idempotency guard for the process-due-schedules poller:
 * only one concurrent caller can win this update for a given row, so a
 * second poll invocation naturally no-ops (`rows[0]` comes back `undefined`)
 * instead of double-sending. Callers claim first, then send, then link the
 * resulting message via `linkEmailScheduleMessage` -- split into two steps
 * because the message doesn't exist yet at claim time.
 */
export async function claimEmailSchedule(
  db: QueryExecutor,
  id: string,
): Promise<EmailScheduleRow | null> {
  const { rows } = await db.query<EmailScheduleRow>(
    `UPDATE email_schedules
     SET status = 'completed', updated_at = now()
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [id],
  );
  return rows[0] ?? null;
}

/** Links a claimed schedule to the email_messages row it produced. */
export async function linkEmailScheduleMessage(
  db: QueryExecutor,
  id: string,
  emailMessageId: string,
): Promise<void> {
  await db.query(
    `UPDATE email_schedules SET email_message_id = $2 WHERE id = $1`,
    [id, emailMessageId],
  );
}

export async function cancelEmailSchedule(
  db: QueryExecutor,
  id: string,
  reason?: string | null,
): Promise<EmailScheduleRow | null> {
  const { rows } = await db.query<EmailScheduleRow>(
    `UPDATE email_schedules
     SET status = 'cancelled', cancel_reason = $2, updated_at = now()
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [id, reason ?? null],
  );
  return rows[0] ?? null;
}

/** Cancels every pending schedule for a candidate whose trigger no longer applies after a status change. */
export async function cancelPendingSchedulesForCampaignApplied(
  db: QueryExecutor,
  campaignAppliedId: string,
  reason: string,
): Promise<EmailScheduleRow[]> {
  const { rows } = await db.query<EmailScheduleRow>(
    `UPDATE email_schedules
     SET status = 'cancelled', cancel_reason = $2, updated_at = now()
     WHERE campaign_applied_id = $1 AND status = 'pending'
     RETURNING *`,
    [campaignAppliedId, reason],
  );
  return rows;
}
