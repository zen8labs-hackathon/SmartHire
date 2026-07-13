import type { QueryExecutor } from "@/lib/db/config/client";

// Two plain FK tables rather than one polymorphic grantee_type/grantee_id
// table (DB7X2K item 5) -- kept as separate repository functions here too,
// for the same reason: every caller already knows whether it's granting to a
// profile or a chapter, so a single branching function would just re-add the
// type-dispatch this design removed.

export type JobAllowedProfileRow = {
  job_id: string;
  profile_id: string;
  granted_by: string | null;
  created_at: Date;
};

export async function listAllowedProfilesForJob(
  db: QueryExecutor,
  jobId: string,
): Promise<JobAllowedProfileRow[]> {
  const { rows } = await db.query<JobAllowedProfileRow>(
    `SELECT * FROM job_allowed_profiles WHERE job_id = $1`,
    [jobId],
  );
  return rows;
}

export async function grantJobToProfile(
  db: QueryExecutor,
  jobId: string,
  profileId: string,
  grantedBy?: string | null,
): Promise<void> {
  await db.query(
    `INSERT INTO job_allowed_profiles (job_id, profile_id, granted_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (job_id, profile_id) DO NOTHING`,
    [jobId, profileId, grantedBy ?? null],
  );
}

export async function revokeJobFromProfile(
  db: QueryExecutor,
  jobId: string,
  profileId: string,
): Promise<void> {
  await db.query(
    `DELETE FROM job_allowed_profiles WHERE job_id = $1 AND profile_id = $2`,
    [jobId, profileId],
  );
}

/**
 * Replaces every viewer grant for a job in one shot (delete-then-bulk-insert),
 * mirroring `profile-chapters.ts`'s `replaceMembershipsForUser`. The delete
 * and insert are two separate statements -- if the insert fails (e.g. a bad
 * FK), an unwrapped call leaves zero grants instead of the old or new list.
 * Callers must run this through `withTransaction` (see `lib/db/client.ts`)
 * and pass the transaction client here as `db`.
 */
export async function replaceAllowedProfilesForJob(
  db: QueryExecutor,
  jobId: string,
  profileIds: string[],
  grantedBy?: string | null,
): Promise<void> {
  await db.query(`DELETE FROM job_allowed_profiles WHERE job_id = $1`, [jobId]);
  if (profileIds.length === 0) return;

  const values: unknown[] = [jobId, grantedBy ?? null];
  const rows = profileIds.map((profileId) => {
    values.push(profileId);
    return `($1, $${values.length}, $2)`;
  });
  await db.query(
    `INSERT INTO job_allowed_profiles (job_id, profile_id, granted_by) VALUES ${rows.join(", ")}`,
    values,
  );
}

export type JobAllowedChapterRow = {
  job_id: string;
  chapter_id: string;
  granted_by: string | null;
  created_at: Date;
};

export async function listAllowedChaptersForJob(
  db: QueryExecutor,
  jobId: string,
): Promise<JobAllowedChapterRow[]> {
  const { rows } = await db.query<JobAllowedChapterRow>(
    `SELECT * FROM job_allowed_chapters WHERE job_id = $1`,
    [jobId],
  );
  return rows;
}

export async function grantJobToChapter(
  db: QueryExecutor,
  jobId: string,
  chapterId: string,
  grantedBy?: string | null,
): Promise<void> {
  await db.query(
    `INSERT INTO job_allowed_chapters (job_id, chapter_id, granted_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (job_id, chapter_id) DO NOTHING`,
    [jobId, chapterId, grantedBy ?? null],
  );
}

export async function revokeJobFromChapter(
  db: QueryExecutor,
  jobId: string,
  chapterId: string,
): Promise<void> {
  await db.query(
    `DELETE FROM job_allowed_chapters WHERE job_id = $1 AND chapter_id = $2`,
    [jobId, chapterId],
  );
}

/**
 * Replaces every chapter viewer grant for a job in one shot
 * (delete-then-bulk-insert). Same partial-failure risk as
 * `replaceAllowedProfilesForJob` -- callers must run this through
 * `withTransaction` and pass the transaction client here as `db`.
 */
export async function replaceAllowedChaptersForJob(
  db: QueryExecutor,
  jobId: string,
  chapterIds: string[],
  grantedBy?: string | null,
): Promise<void> {
  await db.query(`DELETE FROM job_allowed_chapters WHERE job_id = $1`, [jobId]);
  if (chapterIds.length === 0) return;

  const values: unknown[] = [jobId, grantedBy ?? null];
  const rows = chapterIds.map((chapterId) => {
    values.push(chapterId);
    return `($1, $${values.length}, $2)`;
  });
  await db.query(
    `INSERT INTO job_allowed_chapters (job_id, chapter_id, granted_by) VALUES ${rows.join(", ")}`,
    values,
  );
}

/** Per-job evaluation template (DB7X2K item 8), one row per job — replaces the old system-wide singleton template. */
export type JobEvaluateTemplateRow = {
  id: string;
  job_id: string;
  storage_path: string | null;
  original_filename: string | null;
  mime_type: string | null;
  created_by: string | null;
  updated_at: Date;
  updated_by: string | null;
};

export type UpsertJobEvaluateTemplateInput = {
  jobId: string;
  storagePath?: string | null;
  originalFilename?: string | null;
  mimeType?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
};

export async function getJobEvaluateTemplate(
  db: QueryExecutor,
  jobId: string,
): Promise<JobEvaluateTemplateRow | null> {
  const { rows } = await db.query<JobEvaluateTemplateRow>(
    `SELECT * FROM job_evaluate_templates WHERE job_id = $1`,
    [jobId],
  );
  return rows[0] ?? null;
}

/** `job_id` is unique, so this is a natural single-statement upsert rather than a fetch-then-branch. */
export async function upsertJobEvaluateTemplate(
  db: QueryExecutor,
  input: UpsertJobEvaluateTemplateInput,
): Promise<JobEvaluateTemplateRow> {
  const { rows } = await db.query<JobEvaluateTemplateRow>(
    `INSERT INTO job_evaluate_templates
       (job_id, storage_path, original_filename, mime_type, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (job_id) DO UPDATE SET
       storage_path = EXCLUDED.storage_path,
       original_filename = EXCLUDED.original_filename,
       mime_type = EXCLUDED.mime_type,
       updated_by = EXCLUDED.updated_by,
       updated_at = now()
     RETURNING *`,
    [
      input.jobId,
      input.storagePath ?? null,
      input.originalFilename ?? null,
      input.mimeType ?? null,
      input.createdBy ?? null,
      input.updatedBy ?? null,
    ],
  );
  return rows[0];
}

export async function deleteJobEvaluateTemplate(
  db: QueryExecutor,
  jobId: string,
): Promise<void> {
  await db.query(`DELETE FROM job_evaluate_templates WHERE job_id = $1`, [
    jobId,
  ]);
}
