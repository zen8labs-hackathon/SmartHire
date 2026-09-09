import type { QueryExecutor } from "@/lib/db/config/client";

/**
 * Per-job requirement checklist (see `migrations/1788930234004_job-requirements.sql`).
 *
 * Read-only from the app's point of view: rows are produced by the AI extractor
 * at JD-save time (or a manual re-extract) and only ever displayed. There is no
 * per-row edit/delete -- correcting the checklist means correcting the JD or the
 * evaluation criteria it was extracted from.
 *
 * Two independent axes, deliberately not one enum: `importance` is how hard
 * the requirement is, `origin` is where the row came from. The older
 * `JdRequirementSource` (lib/candidates/jd-match-rationale.ts) conflated the
 * two, which is why `criteria` sat next to `must_have` in one list.
 */
export type JobRequirementImportance = "must_have" | "nice_to_have" | "bonus";

/**
 * `manual` is retained for reading only: nothing writes it any more, but rows
 * created while the recruiter-editing flow existed still carry it.
 */
export type JobRequirementOrigin =
  | "jd"
  | "criteria"
  | "ai_inferred"
  | "manual";

export const JOB_REQUIREMENT_IMPORTANCES: readonly JobRequirementImportance[] =
  ["must_have", "nice_to_have", "bonus"];

export const JOB_REQUIREMENT_ORIGINS: readonly JobRequirementOrigin[] = [
  "jd",
  "criteria",
  "ai_inferred",
  "manual",
];

export type JobRequirementRow = {
  /**
   * `bigint` column: `pg`'s default text parsers hand these back as `string`,
   * not `number` (see the note atop `lib/db/config/client.ts`).
   */
  id: string;
  job_id: string;
  requirement: string;
  importance: JobRequirementImportance;
  origin: JobRequirementOrigin;
  created_at: Date;
  updated_at: Date;
};

export type NewJobRequirementInput = {
  requirement: string;
  importance: JobRequirementImportance;
  origin: JobRequirementOrigin;
};

const COLUMNS = `id, job_id, requirement, importance, origin, created_at, updated_at`;

/**
 * Must-haves first, then nice-to-haves, then bonuses; insertion order within a
 * group. The extractor is prompted to emit must-haves first, so this keeps the
 * checklist reading the way the model built it while still grouping by weight.
 */
const ORDER_BY = `
  CASE importance
    WHEN 'must_have' THEN 0
    WHEN 'nice_to_have' THEN 1
    ELSE 2
  END,
  id`;

export async function listJobRequirements(
  db: QueryExecutor,
  jobId: string,
): Promise<JobRequirementRow[]> {
  const { rows } = await db.query<JobRequirementRow>(
    `SELECT ${COLUMNS} FROM job_requirements
     WHERE job_id = $1
     ORDER BY ${ORDER_BY}`,
    [jobId],
  );
  return rows;
}

export async function countJobRequirements(
  db: QueryExecutor,
  jobId: string,
): Promise<number> {
  const { rows } = await db.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM job_requirements WHERE job_id = $1`,
    [jobId],
  );
  return Number(rows[0]?.count ?? 0);
}

/**
 * Swaps in a fresh AI-extracted checklist: the job's rows are the extractor's
 * output and nothing else, so the rebuild replaces all of them. (It used to
 * spare `origin = 'manual'` rows; with recruiter editing gone there is nothing
 * to preserve, and leaving those rows behind would pin a job to a checklist no
 * one can correct.)
 *
 * Both statements must land together, so callers run this inside
 * `withTransaction` (see feedback_db_transaction_n1); the insert is a single
 * `unnest` round-trip rather than a per-item loop.
 */
export async function replaceExtractedJobRequirements(
  db: QueryExecutor,
  jobId: string,
  items: NewJobRequirementInput[],
): Promise<JobRequirementRow[]> {
  await db.query(`DELETE FROM job_requirements WHERE job_id = $1`, [jobId]);

  if (items.length === 0) return [];

  const { rows } = await db.query<JobRequirementRow>(
    `INSERT INTO job_requirements (job_id, requirement, importance, origin)
     SELECT $1, r.requirement, r.importance, r.origin
     FROM unnest($2::text[], $3::text[], $4::text[])
       AS r(requirement, importance, origin)
     RETURNING ${COLUMNS}`,
    [
      jobId,
      items.map((i) => i.requirement),
      items.map((i) => i.importance),
      items.map((i) => i.origin),
    ],
  );
  return rows;
}
