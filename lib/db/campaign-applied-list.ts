import type { QueryExecutor } from "@/lib/db/config/client";
import type { PaginatedResult, PaginationParams } from "@/lib/db/query-helpers";
import { clampLimit, clampOffset, extractWindowTotal } from "@/lib/db/query-helpers";

/**
 * One row of the admin candidates list/pipeline view: a `campaign_applied`
 * (application) joined against its person (`candidates`), its active CV
 * snapshot (`cv_detail_versions`), its job, and its current pipeline
 * stage/sub-stage. Replaces the old single-table `candidates` select in
 * `lib/candidates/candidates-list-query.ts` -- under DB7X2K's normalized
 * schema an "admin candidate row" is really an application, not a person.
 */
export type CampaignAppliedAdminRow = {
  id: string;
  candidate_id: string;
  job_id: string;
  active_cv_version_id: string | null;
  current_job_stage_mapping_id: string | null;
  current_sub_state_id: string | null;
  source: string;
  source_other: string | null;
  expected_salary: string | null;
  jd_match_score: number | null;
  jd_match_status: string;
  jd_match_error: string | null;
  jd_match_rationale: string | null;
  hired_at: Date | null;
  created_at: Date;
  updated_at: Date;
  candidate_name: string | null;
  candidate_email: string | null;
  candidate_phone: string | null;
  candidate_degree: string | null;
  candidate_education: string | null;
  candidate_role: string | null;
  candidate_experience_years: string | null;
  candidate_skills: string[];
  cv_original_filename: string | null;
  cv_mime_type: string | null;
  cv_storage_path: string | null;
  cv_parsing_status: string | null;
  cv_parsing_error: string | null;
  cv_gpa: string | null;
  cv_english_level: string | null;
  cv_date_of_birth: Date | null;
  cv_student_years: string | null;
  cv_created_at: Date | null;
  job_position: string;
  stage_code: string | null;
  stage_label: string | null;
  stage_color: string | null;
  sub_stage_code: string | null;
  sub_stage_label: string | null;
  sub_stage_is_passed: boolean | null;
};

export type ListCampaignAppliedForAdminFilters = PaginationParams & {
  jobId?: string;
  /** Paired with {@link subStateId} -- both required together to filter by pipeline position. */
  stageMappingId?: string;
  subStateId?: string;
  /** Case-insensitive substring match against candidate name/email/role/degree and the CV's original filename. */
  q?: string;
  /** Inclusive lower/upper bound (YYYY-MM-DD) on the active CV version's upload time (falls back to the application's created_at when there's no active version yet). */
  uploadFrom?: string;
  uploadTo?: string;
  /** Defaults to `uploadDate` (the pre-sorting behavior) when omitted. */
  sortBy?: "experience" | "jdMatchScore" | "uploadDate";
  /** Defaults to `desc` when omitted. */
  sortDir?: "asc" | "desc";
};

/**
 * Allowlisted `ORDER BY` fragments -- never build this from raw request
 * input directly (SQL injection), only from this map. `experience`/
 * `jdMatchScore` are nullable columns; `NULLS LAST` is forced regardless of
 * direction so unscored/no-experience candidates always sink to the bottom
 * instead of jumping to the top on ascending sort (Postgres's default null
 * ordering is direction-dependent, which reads as broken here).
 *
 * Every option ends with `, ca.id ASC` -- without a unique tiebreaker,
 * Postgres doesn't guarantee a stable order among rows that tie on the
 * primary sort column (e.g. many rows sharing the same upload timestamp from
 * a bulk seed/import), which under `LIMIT`/`OFFSET` pagination can surface
 * the same row on two different pages, or skip one entirely, between one
 * fetch and the next.
 */
const SORT_COLUMN_SQL: Record<
  NonNullable<ListCampaignAppliedForAdminFilters["sortBy"]>,
  { asc: string; desc: string }
> = {
  experience: {
    asc: "c.experience_years ASC NULLS LAST, ca.id ASC",
    desc: "c.experience_years DESC NULLS LAST, ca.id ASC",
  },
  jdMatchScore: {
    asc: "ca.jd_match_score ASC NULLS LAST, ca.id ASC",
    desc: "ca.jd_match_score DESC NULLS LAST, ca.id ASC",
  },
  uploadDate: {
    asc: "COALESCE(cv.created_at, ca.created_at) ASC, ca.id ASC",
    desc: "COALESCE(cv.created_at, ca.created_at) DESC, ca.id ASC",
  },
};

const ADMIN_ROW_SELECT = `
  ca.id, ca.candidate_id, ca.job_id, ca.active_cv_version_id,
  ca.current_job_stage_mapping_id, ca.current_sub_state_id,
  ca.source, ca.source_other, ca.expected_salary,
  ca.jd_match_score, ca.jd_match_status, ca.jd_match_error, ca.jd_match_rationale,
  ca.hired_at, ca.created_at, ca.updated_at,
  c.name AS candidate_name, c.email AS candidate_email, c.phone AS candidate_phone,
  c.degree AS candidate_degree, c.education AS candidate_education, c.role AS candidate_role,
  c.experience_years AS candidate_experience_years, c.skills AS candidate_skills,
  cv.original_filename AS cv_original_filename, cv.mime_type AS cv_mime_type,
  cv.cv_storage_path AS cv_storage_path, cv.parsing_status AS cv_parsing_status,
  cv.parsing_error AS cv_parsing_error, cv.gpa AS cv_gpa, cv.english_level AS cv_english_level,
  cv.date_of_birth AS cv_date_of_birth, cv.student_years AS cv_student_years,
  cv.created_at AS cv_created_at,
  j.position AS job_position,
  ps.code AS stage_code, ps.label AS stage_label, ps.color AS stage_color,
  pss.code AS sub_stage_code, pss.label AS sub_stage_label, pss.is_passed AS sub_stage_is_passed
`;

const ADMIN_ROW_JOIN = `
  FROM campaign_applied ca
  JOIN candidates c ON c.id = ca.candidate_id AND c.deleted_at IS NULL
  JOIN jobs j ON j.id = ca.job_id
  LEFT JOIN cv_detail_versions cv ON cv.id = ca.active_cv_version_id
  LEFT JOIN job_stage_mappings jsm ON jsm.id = ca.current_job_stage_mapping_id
  LEFT JOIN pipeline_stages ps ON ps.id = jsm.pipeline_stage_id
  LEFT JOIN pipeline_sub_stages pss ON pss.id = ca.current_sub_state_id
`;

/** Single-row equivalent of {@link listCampaignAppliedForAdmin}, same join/shape, for detail/PATCH-response hydration. Returns `null` when not found or soft-deleted. */
export async function getCampaignAppliedAdminRowById(
  db: QueryExecutor,
  id: string,
): Promise<CampaignAppliedAdminRow | null> {
  const { rows } = await db.query<CampaignAppliedAdminRow>(
    `SELECT ${ADMIN_ROW_SELECT} ${ADMIN_ROW_JOIN} WHERE ca.id = $1 AND ca.deleted_at IS NULL`,
    [id],
  );
  return rows[0] ?? null;
}

export type OtherApplicationForCandidateRow = {
  id: string;
  created_at: Date;
  job_id: string;
  job_position: string;
  candidate_name: string | null;
  cv_original_filename: string | null;
  cv_created_at: Date | null;
};

/**
 * Every other (non-deleted) application belonging to the same person as
 * `excludeCampaignAppliedId`'s candidate -- used by the "other applications"
 * panel on a candidate's detail drawer. Person identity is a real FK now, so
 * this is a direct lookup (no more deriving contact info from `parsed_payload`
 * and full-table-scanning for matches).
 */
export async function listOtherApplicationsForCandidate(
  db: QueryExecutor,
  candidateId: string,
  excludeCampaignAppliedId: string,
): Promise<OtherApplicationForCandidateRow[]> {
  const { rows } = await db.query<OtherApplicationForCandidateRow>(
    `SELECT
       ca.id, ca.created_at, ca.job_id, j.position AS job_position,
       c.name AS candidate_name,
       cv.original_filename AS cv_original_filename, cv.created_at AS cv_created_at
     FROM campaign_applied ca
     JOIN candidates c ON c.id = ca.candidate_id
     JOIN jobs j ON j.id = ca.job_id
     LEFT JOIN cv_detail_versions cv ON cv.id = ca.active_cv_version_id
     WHERE ca.candidate_id = $1 AND ca.id != $2 AND ca.deleted_at IS NULL
     ORDER BY ca.created_at DESC`,
    [candidateId, excludeCampaignAppliedId],
  );
  return rows;
}

/**
 * Paginated, filterable admin candidates list. Mirrors the old
 * `queryCandidatesList`'s filter contract (job/stage/date-range/search) but
 * queries the normalized schema directly via a single SQL join instead of
 * PostgREST embeds + an `.or()` filter string -- no legacy-status branch
 * needed since DB7X2K is a green-field migration (old Supabase data isn't
 * carried forward).
 */
export async function listCampaignAppliedForAdmin(
  db: QueryExecutor,
  filters: ListCampaignAppliedForAdminFilters = {},
): Promise<PaginatedResult<CampaignAppliedAdminRow>> {
  const limit = clampLimit(filters.limit);
  const offset = clampOffset(filters.offset);

  const conditions: string[] = ["ca.deleted_at IS NULL"];
  const values: unknown[] = [];

  if (filters.jobId) {
    values.push(filters.jobId);
    conditions.push(`ca.job_id = $${values.length}`);
  }
  if (filters.stageMappingId && filters.subStateId) {
    values.push(filters.stageMappingId);
    conditions.push(`ca.current_job_stage_mapping_id = $${values.length}`);
    values.push(filters.subStateId);
    conditions.push(`ca.current_sub_state_id = $${values.length}`);
  }
  if (filters.uploadFrom) {
    values.push(filters.uploadFrom);
    conditions.push(`COALESCE(cv.created_at, ca.created_at) >= $${values.length}`);
  }
  if (filters.uploadTo) {
    values.push(filters.uploadTo);
    conditions.push(`COALESCE(cv.created_at, ca.created_at) < ($${values.length}::date + 1)`);
  }
  if (filters.q) {
    values.push(`%${filters.q}%`);
    const i = values.length;
    conditions.push(
      `(c.name ILIKE $${i} OR c.email ILIKE $${i} OR c.role ILIKE $${i} OR c.degree ILIKE $${i} OR cv.original_filename ILIKE $${i})`,
    );
  }

  values.push(limit);
  const limitIdx = values.length;
  values.push(offset);
  const offsetIdx = values.length;

  const orderBy =
    SORT_COLUMN_SQL[filters.sortBy ?? "uploadDate"][filters.sortDir ?? "desc"];

  const { rows } = await db.query<CampaignAppliedAdminRow & { total_count: string }>(
    `SELECT ${ADMIN_ROW_SELECT}, count(*) OVER() AS total_count
     ${ADMIN_ROW_JOIN}
     WHERE ${conditions.join(" AND ")}
     ORDER BY ${orderBy}
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

export type CampaignAppliedStageCountRow = {
  stage_code: string;
  stage_label: string;
  sub_stage_code: string;
  sub_stage_label: string;
  count: number;
};

/**
 * Applicant counts for a job, broken down by every (stage, sub-stage) pair
 * configured on that job's pipeline -- including zero-count pairs, same as
 * the old fixed-`CandidateStatus`-enum tally used to pre-seed every status to
 * 0. Replaces that enum breakdown: a custom pipeline's stages/sub-stages
 * aren't a fixed global set, so there's no static list to key a `Record` by
 * anymore -- ordered by the job's actual stage/sub-stage sequence instead.
 *
 * A brand-new application has `current_job_stage_mapping_id`/
 * `current_sub_state_id` both `NULL` until it's explicitly moved -- the UI
 * (`resolveCandidatePipelineIds`) displays those as sitting in the job's
 * first stage's default sub-stage without ever writing that back to the row,
 * so the second half of the `LEFT JOIN` condition below attributes NULL/NULL
 * applications to that same (first stage, default sub-stage) pair. Without
 * it, those applications would silently vanish from every bucket even though
 * they're visibly sitting in "first stage · default" in the table.
 */
export async function countCampaignAppliedByStageForJob(
  db: QueryExecutor,
  jobId: string,
): Promise<CampaignAppliedStageCountRow[]> {
  const { rows } = await db.query<CampaignAppliedStageCountRow & { count: string }>(
    `SELECT ps.code AS stage_code, ps.label AS stage_label,
            pss.code AS sub_stage_code, pss.label AS sub_stage_label,
            count(ca.id) AS count
     FROM job_stage_mappings jsm
     JOIN pipeline_stages ps ON ps.id = jsm.pipeline_stage_id AND ps.deleted_at IS NULL
     JOIN pipeline_sub_stages pss ON pss.pipeline_stage_id = ps.id AND pss.deleted_at IS NULL
     LEFT JOIN campaign_applied ca
       ON ca.job_id = jsm.job_id
       AND ca.deleted_at IS NULL
       AND (
         (ca.current_sub_state_id = pss.id AND ca.current_job_stage_mapping_id = jsm.id)
         OR (
           ca.current_sub_state_id IS NULL
           AND ca.current_job_stage_mapping_id IS NULL
           AND pss.is_default = true
           AND jsm.sequence_number = (
             SELECT MIN(sequence_number) FROM job_stage_mappings
             WHERE job_id = jsm.job_id AND deleted_at IS NULL
           )
         )
       )
     WHERE jsm.job_id = $1 AND jsm.deleted_at IS NULL
     GROUP BY ps.code, ps.label, jsm.sequence_number, pss.code, pss.label, pss.sequence_number
     ORDER BY jsm.sequence_number, pss.sequence_number`,
    [jobId],
  );
  return rows.map((row) => ({ ...row, count: Number(row.count) }));
}
