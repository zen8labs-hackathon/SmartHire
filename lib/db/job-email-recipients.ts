import type { QueryExecutor } from "@/lib/db/config/client";

/** `recipient_source` shape: a list of explicit recipients layered on top of the trigger's default `recipient_type` routing. */
export type EmailRecipientSourceEntry =
  | { kind: "profile"; profileId: string }
  | { kind: "chapter"; chapterId: string }
  | { kind: "email"; email: string };

export type JobEmailRecipientRow = {
  id: string;
  job_id: string;
  trigger_type: string | null;
  recipient_source: EmailRecipientSourceEntry[];
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

/**
 * Looks up the specific-trigger row for `(jobId, triggerType)` first, falling
 * back to the job's catch-all row (`trigger_type IS NULL`) per the unique
 * indexes on `job_email_recipients` (see the base migration).
 */
export async function getJobEmailRecipients(
  db: QueryExecutor,
  jobId: string,
  triggerType: string,
): Promise<JobEmailRecipientRow | null> {
  const { rows } = await db.query<JobEmailRecipientRow>(
    `SELECT * FROM job_email_recipients
     WHERE job_id = $1 AND (trigger_type = $2 OR trigger_type IS NULL)
     ORDER BY trigger_type NULLS LAST
     LIMIT 1`,
    [jobId, triggerType],
  );
  return rows[0] ?? null;
}

/**
 * The base migration enforces uniqueness via two separate partial indexes
 * (specific trigger vs. catch-all), so the `ON CONFLICT` target differs
 * depending on whether `triggerType` is null -- a single `ON CONFLICT
 * (job_id, trigger_type)` clause can't target either partial index.
 */
export async function upsertJobEmailRecipients(
  db: QueryExecutor,
  jobId: string,
  triggerType: string | null,
  recipientSource: EmailRecipientSourceEntry[],
  createdBy?: string | null,
): Promise<JobEmailRecipientRow> {
  const conflictTarget =
    triggerType === null
      ? `(job_id) WHERE trigger_type IS NULL`
      : `(job_id, trigger_type) WHERE trigger_type IS NOT NULL`;

  const { rows } = await db.query<JobEmailRecipientRow>(
    `INSERT INTO job_email_recipients (job_id, trigger_type, recipient_source, created_by)
     VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT ${conflictTarget}
       DO UPDATE SET recipient_source = EXCLUDED.recipient_source, updated_at = now()
     RETURNING *`,
    [jobId, triggerType, JSON.stringify(recipientSource), createdBy ?? null],
  );
  return rows[0];
}
