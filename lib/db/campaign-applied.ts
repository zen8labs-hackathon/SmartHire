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
  job_id: string;
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
  jobId: string;
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

export async function listCampaignAppliedByCandidate(
  db: QueryExecutor,
  candidateId: string,
  pagination: PaginationParams = {},
): Promise<PaginatedResult<CampaignAppliedRow>> {
  const limit = clampLimit(pagination.limit);
  const offset = clampOffset(pagination.offset);

  const { rows } = await db.query<CampaignAppliedRow & { total_count: string }>(
    `SELECT *, count(*) OVER() AS total_count
     FROM campaign_applied
     WHERE candidate_id = $1 AND deleted_at IS NULL
     ORDER BY id DESC
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

export async function updateCampaignApplied(
  db: QueryExecutor,
  id: string,
  patch: UpdateCampaignAppliedInput,
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

  const { rows } = await db.query<CampaignAppliedRow>(
    `UPDATE campaign_applied
     SET ${clause}, updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id, ...values],
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
  jobId: string;
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
