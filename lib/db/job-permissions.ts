import type { QueryExecutor } from "@/lib/db/config/client";
import { buildSetClause } from "@/lib/db/query-helpers";

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

/**
 * Evaluation template (DB7X2K item 8; standalone-library migration
 * 1788939996978). Two kinds of row share this table:
 * - `job_id` set: the job's active template, at most one per job (partial
 *   unique index `job_evaluate_templates_job_id_uidx`).
 * - `job_id` NULL: a library entry -- created independently of any job on
 *   /admin/evaluation-template, named by `title` since there's no job to name
 *   it by. Attaching one to a job at creation time (see
 *   `POST /api/admin/job-descriptions`) copies its fields into a fresh
 *   `job_id`-set row; the library entry itself is untouched and stays
 *   reusable.
 */
export type JobEvaluateTemplateRow = {
  id: string;
  job_id: string | null;
  title: string | null;
  storage_path: string | null;
  original_filename: string | null;
  mime_type: string | null;
  content_text: string | null;
  created_by: string | null;
  updated_at: Date;
  updated_by: string | null;
};

export type UpsertJobEvaluateTemplateInput = {
  jobId: string;
  storagePath?: string | null;
  originalFilename?: string | null;
  mimeType?: string | null;
  contentText?: string | null;
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

/**
 * `job_id` is unique among non-null values (partial index), so this is a
 * natural single-statement upsert rather than a fetch-then-branch. The
 * `WHERE job_id IS NOT NULL` on the conflict target must repeat the index's
 * predicate for Postgres to infer it -- library rows (job_id NULL) never
 * conflict here, which is correct: there's no "the" row for a null job_id to
 * upsert into, each library entry is its own row (see `createEvaluateTemplate`).
 */
export async function upsertJobEvaluateTemplate(
  db: QueryExecutor,
  input: UpsertJobEvaluateTemplateInput,
): Promise<JobEvaluateTemplateRow> {
  const { rows } = await db.query<JobEvaluateTemplateRow>(
    `INSERT INTO job_evaluate_templates
       (job_id, storage_path, original_filename, mime_type, content_text, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (job_id) WHERE job_id IS NOT NULL DO UPDATE SET
       storage_path = EXCLUDED.storage_path,
       original_filename = EXCLUDED.original_filename,
       mime_type = EXCLUDED.mime_type,
       content_text = EXCLUDED.content_text,
       updated_by = EXCLUDED.updated_by,
       updated_at = now()
     RETURNING *`,
    [
      input.jobId,
      input.storagePath ?? null,
      input.originalFilename ?? null,
      input.mimeType ?? null,
      input.contentText ?? null,
      input.createdBy ?? null,
      input.updatedBy ?? null,
    ],
  );
  return rows[0];
}

// --- Library entries (job_id IS NULL) -------------------------------------
// Managed on /admin/evaluation-template; reused (copied) into a job-scoped
// row at job-creation time -- see POST /api/admin/job-descriptions.

export type CreateEvaluateTemplateInput = {
  title: string;
  storagePath?: string | null;
  originalFilename?: string | null;
  mimeType?: string | null;
  contentText?: string | null;
  createdBy: string;
};

/**
 * Creates a standalone (`job_id` NULL) template. A plain INSERT, not an
 * upsert -- unlike a job's one row, a library entry has no natural slot to
 * conflict into; every call makes a new row.
 */
export async function createEvaluateTemplate(
  db: QueryExecutor,
  input: CreateEvaluateTemplateInput,
): Promise<JobEvaluateTemplateRow> {
  const { rows } = await db.query<JobEvaluateTemplateRow>(
    `INSERT INTO job_evaluate_templates
       (job_id, title, storage_path, original_filename, mime_type, content_text, created_by, updated_by)
     VALUES (NULL, $1, $2, $3, $4, $5, $6, $6)
     RETURNING *`,
    [
      input.title,
      input.storagePath ?? null,
      input.originalFilename ?? null,
      input.mimeType ?? null,
      input.contentText ?? null,
      input.createdBy,
    ],
  );
  return rows[0];
}

/** A library row plus who created it, for a listing that mixes more than one person's entries. */
export type JobEvaluateTemplateWithCreator = JobEvaluateTemplateRow & {
  created_by_username: string | null;
  created_by_email: string | null;
};

/**
 * Library entries, newest first -- feeds /admin/evaluation-template's list
 * (HR/admin only, see that route: every caller may see every entry there) and
 * the Create Job modal's "reuse an existing evaluation template" picker
 * (HR/admin get `createdBy: null` there too; a chapter head passes their own
 * id and sees only their own entries). `job_id IS NULL` excludes job-scoped
 * rows; the content check excludes a template whose file/text was never
 * finalized (e.g. an abandoned upload).
 */
export async function listEvaluateTemplates(
  db: QueryExecutor,
  createdBy: string | null,
): Promise<JobEvaluateTemplateWithCreator[]> {
  const { rows } = await db.query<JobEvaluateTemplateWithCreator>(
    `SELECT t.*, u.username AS created_by_username, u.email AS created_by_email
     FROM job_evaluate_templates t
     LEFT JOIN users u ON u.id = t.created_by
     WHERE t.job_id IS NULL
       AND (t.storage_path IS NOT NULL OR t.content_text IS NOT NULL)
       AND ($1::uuid IS NULL OR t.created_by = $1)
     ORDER BY t.updated_at DESC`,
    [createdBy],
  );
  return rows;
}

/**
 * `id` alone is a guessable sequence value, so a mutation-bound read is
 * scoped by `created_by` too -- a user can only edit/delete their own
 * entries (`job_id IS NULL` keeps this from ever reaching into job-scoped
 * rows). Used by PATCH/DELETE, and by the Create Job reuse flow for a
 * non-HR/admin caller.
 */
export async function getEvaluateTemplateById(
  db: QueryExecutor,
  id: string,
  createdBy: string,
): Promise<JobEvaluateTemplateRow | null> {
  const { rows } = await db.query<JobEvaluateTemplateRow>(
    `SELECT * FROM job_evaluate_templates
     WHERE id = $1 AND created_by = $2 AND job_id IS NULL`,
    [id, createdBy],
  );
  return rows[0] ?? null;
}

/**
 * Same as {@link getEvaluateTemplateById} but without the ownership check --
 * for read-only access by a caller who's already allowed to see every
 * library entry (HR/admin): downloading a file from the shared list, or
 * reusing anyone's template when creating a job. Never used to authorize a
 * write.
 */
export async function getEvaluateTemplateByIdForRead(
  db: QueryExecutor,
  id: string,
): Promise<JobEvaluateTemplateRow | null> {
  const { rows } = await db.query<JobEvaluateTemplateRow>(
    `SELECT * FROM job_evaluate_templates WHERE id = $1 AND job_id IS NULL`,
    [id],
  );
  return rows[0] ?? null;
}

export type UpdateEvaluateTemplateInput = {
  title?: string;
  storagePath?: string | null;
  originalFilename?: string | null;
  mimeType?: string | null;
  contentText?: string | null;
};

export async function updateEvaluateTemplate(
  db: QueryExecutor,
  id: string,
  createdBy: string,
  patch: UpdateEvaluateTemplateInput,
  updatedBy: string,
): Promise<JobEvaluateTemplateRow | null> {
  const { clause, values } = buildSetClause(
    {
      title: patch.title,
      storage_path: patch.storagePath,
      original_filename: patch.originalFilename,
      mime_type: patch.mimeType,
      content_text: patch.contentText,
    },
    4,
  );
  if (!clause) return getEvaluateTemplateById(db, id, createdBy);

  const { rows } = await db.query<JobEvaluateTemplateRow>(
    `UPDATE job_evaluate_templates
     SET ${clause}, updated_by = $3, updated_at = now()
     WHERE id = $1 AND created_by = $2 AND job_id IS NULL
     RETURNING *`,
    [id, createdBy, updatedBy, ...values],
  );
  return rows[0] ?? null;
}

export async function deleteEvaluateTemplateById(
  db: QueryExecutor,
  id: string,
  createdBy: string,
): Promise<JobEvaluateTemplateRow | null> {
  const { rows } = await db.query<JobEvaluateTemplateRow>(
    `DELETE FROM job_evaluate_templates
     WHERE id = $1 AND created_by = $2 AND job_id IS NULL
     RETURNING *`,
    [id, createdBy],
  );
  return rows[0] ?? null;
}

export async function deleteJobEvaluateTemplate(
  db: QueryExecutor,
  jobId: string,
): Promise<void> {
  await db.query(`DELETE FROM job_evaluate_templates WHERE job_id = $1`, [
    jobId,
  ]);
}
