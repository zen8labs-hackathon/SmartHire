import type { QueryExecutor } from "@/lib/db/config/client";
import {
  createCvDetailVersion,
  type CreateCvDetailVersionInput,
  type CvDetailVersionRow,
} from "@/lib/db/cv-detail-versions";
import type { PaginatedResult, PaginationParams } from "@/lib/db/query-helpers";
import {
  buildSetClause,
  clampLimit,
  clampOffset,
  extractWindowTotal,
} from "@/lib/db/query-helpers";

export type CampaignAppliedSource =
  | "LinkedIn"
  | "TopCV"
  | "ITViec"
  | "Facebook"
  | "TopDev"
  | "Other";

/** One candidate's application to one job. `active_cv_version_id` points at the `cv_detail_versions` row currently used for display/matching; older versions stay in history. */
export type CampaignAppliedRow = {
  id: string;
  candidate_id: string;
  /** NULL means "unassigned / pool" -- banked before a job exists (CJ4X9M). */
  job_id: string | null;
  active_cv_version_id: string | null;
  current_job_stage_mapping_id: string | null;
  current_sub_state_id: string | null;
  source: CampaignAppliedSource;
  source_other: string | null;
  expected_salary: string | null;
  jd_match_score: number | null;
  jd_match_status: string;
  jd_match_error: string | null;
  jd_match_rationale: string | null;
  hired_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type CreateCampaignAppliedInput = {
  candidateId: string;
  jobId: string | null;
  source?: CampaignAppliedSource;
  sourceOther?: string | null;
  expectedSalary?: string | null;
};

export type UpdateCampaignAppliedInput = {
  activeCvVersionId?: string | null;
  currentJobStageMappingId?: string | null;
  currentSubStateId?: string | null;
  source?: CampaignAppliedSource;
  sourceOther?: string | null;
  expectedSalary?: string | null;
  jdMatchScore?: number | null;
  jdMatchStatus?: string;
  jdMatchError?: string | null;
  jdMatchRationale?: string | null;
  hiredAt?: Date | string | null;
};

export type ListCampaignAppliedByJobFilters = PaginationParams & {
  currentJobStageMappingId?: string;
  currentSubStateId?: string;
};

export async function getCampaignAppliedById(
  db: QueryExecutor,
  id: string,
): Promise<CampaignAppliedRow | null> {
  const { rows } = await db.query<CampaignAppliedRow>(
    `SELECT * FROM campaign_applied WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return rows[0] ?? null;
}

export async function getCampaignAppliedByCandidateAndJob(
  db: QueryExecutor,
  candidateId: string,
  jobId: string,
): Promise<CampaignAppliedRow | null> {
  const { rows } = await db.query<CampaignAppliedRow>(
    `SELECT * FROM campaign_applied
     WHERE candidate_id = $1 AND job_id = $2 AND deleted_at IS NULL
     LIMIT 1`,
    [candidateId, jobId],
  );
  return rows[0] ?? null;
}

/** Batched fetch for a set of ids in one query (see feedback on N+1 batching). */
export async function listCampaignAppliedByIds(
  db: QueryExecutor,
  ids: string[],
): Promise<CampaignAppliedRow[]> {
  if (ids.length === 0) return [];
  const { rows } = await db.query<CampaignAppliedRow>(
    `SELECT * FROM campaign_applied WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`,
    [ids],
  );
  return rows;
}

/** Batched form of {@link getCampaignAppliedByCandidateAndJob} -- one query for a set of candidate ids instead of N. */
export async function listCampaignAppliedByCandidateIdsAndJob(
  db: QueryExecutor,
  candidateIds: string[],
  jobId: string,
): Promise<CampaignAppliedRow[]> {
  if (candidateIds.length === 0) return [];
  const { rows } = await db.query<CampaignAppliedRow>(
    `SELECT * FROM campaign_applied
     WHERE candidate_id = ANY($1::uuid[]) AND job_id = $2 AND deleted_at IS NULL`,
    [candidateIds, jobId],
  );
  return rows;
}

/**
 * A `campaign_applied` row plus its job's title/created-at and its raw
 * current stage/sub-stage label info, for display (e.g. the candidate
 * drawer's "All applications" panel) without a separate per-row lookup.
 * `job_title`/`job_created_at` are `null` for a pool/unassigned application
 * (`job_id IS NULL`) or a soft-deleted job. `stage_*`/`sub_stage_*` are
 * `null` both when the application has no job and when it's never been
 * explicitly moved yet (`current_job_stage_mapping_id`/`current_sub_state_id`
 * start `NULL` on every new application by design -- see
 * `assignJobToCampaignApplied`'s doc comment -- so this raw join does *not*
 * fall back to the job's first stage the way `resolveApplicationStages`
 * does; callers that need that fallback should use that instead).
 */
export type CampaignAppliedWithJobRow = CampaignAppliedRow & {
  job_title: string | null;
  job_created_at: Date | null;
  stage_code: string | null;
  stage_label: string | null;
  stage_color: string | null;
  sub_stage_code: string | null;
  sub_stage_label: string | null;
  sub_stage_is_passed: boolean | null;
};

export async function listCampaignAppliedByCandidate(
  db: QueryExecutor,
  candidateId: string,
  pagination: PaginationParams = {},
): Promise<PaginatedResult<CampaignAppliedWithJobRow>> {
  const limit = clampLimit(pagination.limit);
  const offset = clampOffset(pagination.offset);

  const { rows } = await db.query<
    CampaignAppliedWithJobRow & { total_count: string }
  >(
    `SELECT ca.*, j.position AS job_title, j.created_at AS job_created_at,
            ps.code AS stage_code, ps.label AS stage_label, ps.color AS stage_color,
            pss.code AS sub_stage_code, pss.label AS sub_stage_label,
            pss.is_passed AS sub_stage_is_passed,
            count(*) OVER() AS total_count
     FROM campaign_applied ca
     LEFT JOIN jobs j ON j.id = ca.job_id AND j.deleted_at IS NULL
     LEFT JOIN job_stage_mappings jsm ON jsm.id = ca.current_job_stage_mapping_id
     LEFT JOIN pipeline_stages ps ON ps.id = jsm.pipeline_stage_id
     LEFT JOIN pipeline_sub_stages pss ON pss.id = ca.current_sub_state_id
     WHERE ca.candidate_id = $1 AND ca.deleted_at IS NULL
     ORDER BY ca.id DESC
     LIMIT $2 OFFSET $3`,
    [candidateId, limit, offset],
  );

  return {
    rows: rows.map(({ total_count: _total_count, ...row }) => row),
    total: extractWindowTotal(rows),
    limit,
    offset,
  };
}

export async function listCampaignAppliedByJob(
  db: QueryExecutor,
  jobId: string,
  filters: ListCampaignAppliedByJobFilters = {},
): Promise<PaginatedResult<CampaignAppliedRow>> {
  const limit = clampLimit(filters.limit);
  const offset = clampOffset(filters.offset);

  const conditions = ["job_id = $1", "deleted_at IS NULL"];
  const values: unknown[] = [jobId];

  if (filters.currentJobStageMappingId) {
    values.push(filters.currentJobStageMappingId);
    conditions.push(`current_job_stage_mapping_id = $${values.length}`);
  }
  if (filters.currentSubStateId) {
    values.push(filters.currentSubStateId);
    conditions.push(`current_sub_state_id = $${values.length}`);
  }

  values.push(limit);
  const limitIdx = values.length;
  values.push(offset);
  const offsetIdx = values.length;

  const { rows } = await db.query<CampaignAppliedRow & { total_count: string }>(
    `SELECT *, count(*) OVER() AS total_count
     FROM campaign_applied
     WHERE ${conditions.join(" AND ")}
     ORDER BY id DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    values,
  );

  return {
    rows: rows.map(({ total_count: _total_count, ...row }) => row),
    total: extractWindowTotal(rows),
    limit,
    offset,
  };
}

export async function createCampaignApplied(
  db: QueryExecutor,
  input: CreateCampaignAppliedInput,
): Promise<CampaignAppliedRow> {
  const { rows } = await db.query<CampaignAppliedRow>(
    `INSERT INTO campaign_applied (candidate_id, job_id, source, source_other, expected_salary)
     VALUES ($1, $2, COALESCE($3, 'Other'), $4, $5)
     RETURNING *`,
    [
      input.candidateId,
      input.jobId,
      input.source ?? null,
      input.sourceOther ?? null,
      input.expectedSalary ?? null,
    ],
  );
  return rows[0];
}

/**
 * Folds "check for an existing application, else create one" into a single
 * round trip via `ON CONFLICT` against `campaign_applied_candidate_job_unique_idx`
 * -- for callers (e.g. the CV-upload worker) that would otherwise pay for a
 * separate `getCampaignAppliedByCandidateAndJob` SELECT before this INSERT.
 * The `DO UPDATE` is a no-op write (bumps `updated_at`) purely so `ON
 * CONFLICT` still returns the existing row via `RETURNING`.
 *
 * Only actually de-duplicates when `jobId` is non-null -- that index is
 * partial (excludes `job_id IS NULL`) by design, so a pool/unassigned
 * application always inserts a fresh row here, same as `createCampaignApplied`.
 */
export async function getOrCreateCampaignApplied(
  db: QueryExecutor,
  input: CreateCampaignAppliedInput,
): Promise<{ application: CampaignAppliedRow; created: boolean }> {
  const { rows } = await db.query<CampaignAppliedRow & { created: boolean }>(
    `INSERT INTO campaign_applied (candidate_id, job_id, source, source_other, expected_salary)
     VALUES ($1, $2, COALESCE($3, 'Other'), $4, $5)
     ON CONFLICT (candidate_id, job_id) WHERE deleted_at IS NULL AND job_id IS NOT NULL
     DO UPDATE SET updated_at = now()
     RETURNING *, (xmax = 0) AS created`,
    [
      input.candidateId,
      input.jobId,
      input.source ?? null,
      input.sourceOther ?? null,
      input.expectedSalary ?? null,
    ],
  );
  const { created, ...application } = rows[0];
  return { application, created };
}

export async function updateCampaignApplied(
  db: QueryExecutor,
  id: string,
  patch: UpdateCampaignAppliedInput,
  options?: {
    /**
     * Guards the write with `AND active_cv_version_id = $N`, turning it into
     * a no-op if a newer CV version has since become active. Used when
     * saving a JD-match result computed against a specific CV version: two
     * duplicate CVs merging into the same application can each kick off
     * their own scoring call, and without this guard whichever call
     * finishes last -- not necessarily the one scoring the currently active
     * CV -- would win and overwrite the correct score.
     */
    guardActiveCvVersionId?: string;
  },
): Promise<CampaignAppliedRow | null> {
  const { clause, values } = buildSetClause(
    {
      active_cv_version_id: patch.activeCvVersionId,
      current_job_stage_mapping_id: patch.currentJobStageMappingId,
      current_sub_state_id: patch.currentSubStateId,
      source: patch.source,
      source_other: patch.sourceOther,
      expected_salary: patch.expectedSalary,
      jd_match_score: patch.jdMatchScore,
      jd_match_status: patch.jdMatchStatus,
      jd_match_error: patch.jdMatchError,
      jd_match_rationale: patch.jdMatchRationale,
      hired_at: patch.hiredAt,
    },
    2,
  );
  if (!clause) return getCampaignAppliedById(db, id);

  const guardId = options?.guardActiveCvVersionId;
  const guardClause = guardId ? ` AND active_cv_version_id = $${values.length + 2}` : "";

  const { rows } = await db.query<CampaignAppliedRow>(
    `UPDATE campaign_applied
     SET ${clause}, updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL${guardClause}
     RETURNING *`,
    guardId ? [id, ...values, guardId] : [id, ...values],
  );
  return rows[0] ?? null;
}

/**
 * Optimistic-lock transition: sets `jd_match_status` to `"processing"` only
 * if it currently holds one of `fromStatuses`, atomically, via a WHERE-guard
 * UPDATE. Returns the row when the lock was acquired, `null` when another
 * caller already holds it (or the application is already scored/deleted) --
 * callers use this to detect a lost race without needing a separate
 * transaction. Locks at the `campaign_applied` level (not per CV version)
 * since `runJdMatchForCandidate` reads/writes the application as the unit of
 * work; `jd_match_status` has a `NOT NULL DEFAULT 'pending'` on this table
 * (unlike `cv_detail_versions`), so no NULL-handling is needed here.
 */
export async function lockCampaignAppliedForJdMatch(
  db: QueryExecutor,
  id: string,
  fromStatuses: string[],
): Promise<CampaignAppliedRow | null> {
  const { rows } = await db.query<CampaignAppliedRow>(
    `UPDATE campaign_applied
     SET jd_match_status = 'processing', jd_match_error = NULL, updated_at = now()
     WHERE id = $1 AND jd_match_status = ANY($2::text[]) AND deleted_at IS NULL
     RETURNING *`,
    [id, fromStatuses],
  );
  return rows[0] ?? null;
}

export async function softDeleteCampaignApplied(
  db: QueryExecutor,
  id: string,
): Promise<CampaignAppliedRow | null> {
  const { rows } = await db.query<CampaignAppliedRow>(
    `UPDATE campaign_applied
     SET deleted_at = now(), updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * Attaches a job to a currently-unassigned/pool application (CJ4X9M).
 * Guarded by `job_id IS NULL` so this can only ever move a job-less
 * application into a job, never reassign one that already has one (that's a
 * different, not-yet-built operation) -- also closes the race where two
 * concurrent assign calls for the same row would otherwise both "succeed".
 * Deliberately does not touch `current_job_stage_mapping_id`/
 * `current_sub_state_id` or trigger JD-match: per CJ4X9M's decisions, a
 * freshly-assigned application starts stage-less (same as today's
 * creation-time default) and JD-match stays an explicit, separate action.
 */
export async function assignJobToCampaignApplied(
  db: QueryExecutor,
  id: string,
  jobId: string,
): Promise<CampaignAppliedRow | null> {
  const { rows } = await db.query<CampaignAppliedRow>(
    `UPDATE campaign_applied
     SET job_id = $2, updated_at = now()
     WHERE id = $1 AND job_id IS NULL AND deleted_at IS NULL
     RETURNING *`,
    [id, jobId],
  );
  return rows[0] ?? null;
}

/**
 * Soft-deletes every remaining live application for a person, regardless of
 * job. Used by the person-scoped "delete candidate" action on the deduped
 * `/candidates` list (`DELETE .../[id]?scope=person`), which removes the
 * whole person -- unlike the default scope (used by the per-job JD pipeline
 * table), which only removes the one application being acted on and leaves
 * the person's applications to other jobs untouched.
 */
export async function softDeleteAllCampaignAppliedForCandidate(
  db: QueryExecutor,
  candidateId: string,
): Promise<CampaignAppliedRow[]> {
  const { rows } = await db.query<CampaignAppliedRow>(
    `UPDATE campaign_applied
     SET deleted_at = now(), updated_at = now()
     WHERE candidate_id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [candidateId],
  );
  return rows;
}

/**
 * Bulk version of {@link softDeleteAllCampaignAppliedForCandidate}: soft-deletes
 * every live application belonging to any of the given people, in one query.
 * Backs the `/candidates` bulk person delete.
 */
export async function softDeleteAllCampaignAppliedForCandidates(
  db: QueryExecutor,
  candidateIds: string[],
): Promise<CampaignAppliedRow[]> {
  if (candidateIds.length === 0) return [];
  const { rows } = await db.query<CampaignAppliedRow>(
    `UPDATE campaign_applied
     SET deleted_at = now(), updated_at = now()
     WHERE candidate_id = ANY($1::uuid[]) AND deleted_at IS NULL
     RETURNING *`,
    [candidateIds],
  );
  return rows;
}

/**
 * Soft-deletes every remaining live application for a job, regardless of
 * candidate. Used when soft-deleting the job itself (`DELETE
 * /api/admin/job-descriptions/[id]`) -- a deleted job shouldn't leave its
 * applications live and orphaned, still showing up in candidate-level views
 * that don't join through `jobs`.
 */
export async function softDeleteAllCampaignAppliedForJob(
  db: QueryExecutor,
  jobId: string,
): Promise<CampaignAppliedRow[]> {
  const { rows } = await db.query<CampaignAppliedRow>(
    `UPDATE campaign_applied
     SET deleted_at = now(), updated_at = now()
     WHERE job_id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [jobId],
  );
  return rows;
}

export async function setActiveCvVersion(
  db: QueryExecutor,
  campaignAppliedId: string,
  cvVersionId: string,
): Promise<CampaignAppliedRow | null> {
  const { rows } = await db.query<CampaignAppliedRow>(
    `UPDATE campaign_applied
     SET active_cv_version_id = $2, updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [campaignAppliedId, cvVersionId],
  );
  return rows[0] ?? null;
}

export type CreateApplicationWithInitialCvInput = {
  candidateId: string;
  jobId: string | null;
  source?: CampaignAppliedSource;
  sourceOther?: string | null;
  expectedSalary?: string | null;
  cv: Omit<
    CreateCvDetailVersionInput,
    "campaignAppliedId" | "versionNumber" | "cvStoragePath"
  > & {
    /**
     * The S3 key nests under `{candidateId}/{applicationId}/...` for
     * readability, but the application id only exists once the
     * `campaign_applied` insert below runs — so the caller supplies a
     * builder instead of a precomputed path.
     */
    buildCvStoragePath: (applicationId: string) => string;
  };
};

/**
 * Inserts a new `campaign_applied` row together with its version-1
 * `cv_detail_versions` row and points `active_cv_version_id` back at it —
 * the 3-statement write the circular FK between the two tables requires
 * (`campaign_applied.active_cv_version_id` -> `cv_detail_versions.id` and
 * `cv_detail_versions.campaign_applied_id` -> `campaign_applied.id`).
 *
 * Caller must supply a client already inside a transaction, e.g.:
 * `await withTransaction((client) => createApplicationWithInitialCv(client, input))`
 * — this function does not open one itself, so it composes with other writes
 * that need to share the same transaction.
 */
/**
 * Counts active (non-soft-deleted) applications per job, scoped to `jobIds`.
 * Replaces the old `job_openings.select("candidates(count)")` Supabase embed
 * now that applicant counts live on `campaign_applied` directly.
 */
export async function countActiveApplicationsByJobIds(
  db: QueryExecutor,
  jobIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (jobIds.length === 0) return counts;

  const { rows } = await db.query<{ job_id: string; count: string }>(
    `SELECT job_id, count(*) AS count
     FROM campaign_applied
     WHERE deleted_at IS NULL AND job_id = ANY($1::uuid[])
     GROUP BY job_id`,
    [jobIds],
  );
  for (const r of rows) {
    counts.set(r.job_id, Number(r.count));
  }
  return counts;
}

export async function createApplicationWithInitialCv(
  db: QueryExecutor,
  input: CreateApplicationWithInitialCvInput,
): Promise<{ application: CampaignAppliedRow; cvVersion: CvDetailVersionRow }> {
  const application = await createCampaignApplied(db, {
    candidateId: input.candidateId,
    jobId: input.jobId,
    source: input.source,
    sourceOther: input.sourceOther,
    expectedSalary: input.expectedSalary,
  });

  const { buildCvStoragePath, ...cvInput } = input.cv;
  const cvVersion = await createCvDetailVersion(db, {
    ...cvInput,
    cvStoragePath: buildCvStoragePath(application.id),
    campaignAppliedId: application.id,
    versionNumber: 1,
  });

  const updated = await setActiveCvVersion(db, application.id, cvVersion.id);

  return { application: updated ?? application, cvVersion };
}
