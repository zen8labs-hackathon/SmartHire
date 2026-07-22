import type { QueryExecutor } from "@/lib/db/config/client";
import type { PaginatedResult, PaginationParams } from "@/lib/db/query-helpers";
import {
  clampLimit,
  clampOffset,
  extractWindowTotal,
} from "@/lib/db/query-helpers";

/**
 * One existing application whose person or CV file matches a submitted
 * signal. Granularity is "one application" (not "one person"), mirroring
 * the old schema's one-row-per-upload dedupe hits so a person with several
 * past applications (to different jobs) can surface more than once -- but
 * exactly once per application, via its *active* CV version. Joining every
 * historical `cv_detail_versions` row instead (i.e. every past re-upload on
 * the same application) would return the same `campaign_applied_id` once
 * per version, which is what produced the "same key" React warning in
 * `DuplicateCandidateModal`'s `hits.map(h => <div key={h.id}>)`.
 */
export type DedupeSignalMatch = {
  candidate_id: string;
  candidate_name: string | null;
  candidate_email: string | null;
  candidate_phone: string | null;
  campaign_applied_id: string;
  job_id: string;
  job_position: string;
  cv_version_id: string | null;
  cv_original_filename: string | null;
  cv_file_sha256: string | null;
  cv_content_sha256: string | null;
  cv_role: string | null;
  created_at: Date;
  cv_created_at: Date | null;
  /** Current pipeline position, for display in a duplicate-hit list -- null when never assigned a stage. */
  stage_label: string | null;
  sub_stage_label: string | null;
};

/** Display label for a match's current pipeline position, e.g. "Interview · Passed". `"New"` only when the application genuinely has no stage assigned yet -- never a fabricated placeholder for one that does. */
export function dedupeMatchStatusLabel(match: {
  stage_label: string | null;
  sub_stage_label: string | null;
}): string {
  if (!match.stage_label) return "New";
  return match.sub_stage_label
    ? `${match.stage_label} · ${match.sub_stage_label}`
    : match.stage_label;
}

export type DedupeSignals = {
  /** Exact match, case-insensitive. */
  email?: string | null;
  /** Exact match against any of the caller's normalized phone variants. */
  phoneVariants?: string[];
  cvFileSha256?: string | null;
  cvContentSha256?: string | null;
};

/**
 * Targeted duplicate-detection lookup: finds existing applications whose
 * person (email/phone) or CV file (raw-byte / normalized-text hash) matches
 * one of the given signals. Replaces the "pull every active candidate row,
 * filter in JS" pattern used by the old `/process`, `/check-duplicate`, and
 * `/other-applications` routes -- callers should still apply
 * `findDuplicateCandidateHits`-style priority logic (email/phone over hash)
 * on the returned rows, but the DB round trip itself is now a targeted query
 * instead of a full-table scan.
 *
 * Returns `[]` without querying when no signal is provided (mirrors the old
 * `shouldFetchCandidatesForDedupe` short-circuit).
 */
export async function findCandidatesByDedupeSignals(
  db: QueryExecutor,
  signals: DedupeSignals,
  excludeCampaignAppliedId?: string,
): Promise<DedupeSignalMatch[]> {
  const email = signals.email?.trim() || null;
  const phoneVariants =
    signals.phoneVariants && signals.phoneVariants.length > 0
      ? signals.phoneVariants
      : null;
  const cvFileSha256 = signals.cvFileSha256?.trim() || null;
  const cvContentSha256 = signals.cvContentSha256?.trim() || null;

  if (!email && !phoneVariants && !cvFileSha256 && !cvContentSha256) {
    return [];
  }

  const values: unknown[] = [
    email ? email.toLowerCase() : null,
    phoneVariants,
    cvFileSha256,
    cvContentSha256,
  ];
  const matchClauses = [
    `($1::text IS NOT NULL AND lower(c.email) = $1)`,
    `($2::text[] IS NOT NULL AND c.phone = ANY($2))`,
    `($3::text IS NOT NULL AND cv.cv_file_sha256 = $3)`,
    `($4::text IS NOT NULL AND cv.cv_content_sha256 = $4)`,
  ];

  let excludeClause = "";
  if (excludeCampaignAppliedId) {
    values.push(excludeCampaignAppliedId);
    excludeClause = `AND ca.id != $${values.length}`;
  }

  const { rows } = await db.query<DedupeSignalMatch>(
    `SELECT
       c.id AS candidate_id, c.name AS candidate_name, c.email AS candidate_email, c.phone AS candidate_phone,
       ca.id AS campaign_applied_id, ca.job_id, j.position AS job_position,
       cv.id AS cv_version_id, cv.original_filename AS cv_original_filename,
       cv.cv_file_sha256, cv.cv_content_sha256, cv.role AS cv_role,
       ca.created_at, cv.created_at AS cv_created_at,
       ps.label AS stage_label, pss.label AS sub_stage_label
     FROM campaign_applied ca
     JOIN candidates c ON c.id = ca.candidate_id AND c.deleted_at IS NULL
     JOIN jobs j ON j.id = ca.job_id
     LEFT JOIN cv_detail_versions cv ON cv.id = ca.active_cv_version_id
     LEFT JOIN job_stage_mappings jsm ON jsm.id = ca.current_job_stage_mapping_id
     LEFT JOIN pipeline_stages ps ON ps.id = jsm.pipeline_stage_id
     LEFT JOIN pipeline_sub_stages pss ON pss.id = ca.current_sub_state_id
     WHERE ca.deleted_at IS NULL
       AND (${matchClauses.join(" OR ")})
       ${excludeClause}
     ORDER BY ca.id DESC`,
    values,
  );
  return rows;
}

/** One row of the admin "deduped candidates" list: one person, enriched with their most recent (non-deleted) application. */
export type DedupedCandidateAdminRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  degree: string | null;
  education: string | null;
  role: string | null;
  experience_years: string | null;
  skills: string[];
  created_at: Date;
  updated_at: Date;
  campaign_applied_id: string;
  job_id: string;
  job_position: string;
  source: string | null;
  source_other: string | null;
  expected_salary: string | null;
  jd_match_score: number | null;
  jd_match_status: string | null;
  jd_match_error: string | null;
  jd_match_rationale: string | null;
  current_job_stage_mapping_id: string | null;
  current_sub_state_id: string | null;
  stage_label: string | null;
  sub_stage_label: string | null;
  cv_storage_path: string | null;
  cv_original_filename: string | null;
  cv_mime_type: string | null;
  cv_parsing_status: string | null;
  cv_parsing_error: string | null;
  cv_parsed_payload: unknown;
  cv_created_at: Date | null;
};

export type ListDedupedCandidatesForAdminFilters = PaginationParams & {
  /** Case-insensitive substring match against name/email/role/degree/CV filename, plus job position and skills. */
  q?: string;
  /** Inclusive lower/upper bound (YYYY-MM-DD) on the latest application's active CV upload time. */
  uploadFrom?: string;
  uploadTo?: string;
};

/**
 * One row per person (not per application), each enriched with their most
 * recent non-deleted `campaign_applied` row -- replaces the old schema's
 * "pull 5000 rows, dedupe/merge/paginate in JS" list with dedupe-by-person
 * being inherent in the new schema (one `candidates` row already is one
 * person) plus real SQL pagination.
 *
 * `latest_apps`/`jobs` are inner-joined (not left) on purpose: a person with
 * zero live applications has nothing for any of the admin dashboard's
 * per-row actions (view/edit/move-stage/delete, all keyed by
 * `campaign_applied_id`) to act on, so they're excluded here rather than
 * surfaced with a null id that silently 404s downstream.
 */
export async function listDedupedCandidatesForAdmin(
  db: QueryExecutor,
  filters: ListDedupedCandidatesForAdminFilters = {},
): Promise<PaginatedResult<DedupedCandidateAdminRow>> {
  const limit = clampLimit(filters.limit);
  const offset = clampOffset(filters.offset);

  const conditions: string[] = ["c.deleted_at IS NULL"];
  const values: unknown[] = [];

  if (filters.uploadFrom) {
    values.push(filters.uploadFrom);
    conditions.push(
      `COALESCE(cv.created_at, la.created_at) >= $${values.length}`,
    );
  }
  if (filters.uploadTo) {
    values.push(filters.uploadTo);
    conditions.push(
      `COALESCE(cv.created_at, la.created_at) < ($${values.length}::date + 1)`,
    );
  }
  if (filters.q) {
    values.push(`%${filters.q}%`);
    const i = values.length;
    conditions.push(
      `(c.name ILIKE $${i} OR c.email ILIKE $${i} OR c.role ILIKE $${i} OR c.degree ILIKE $${i} OR cv.original_filename ILIKE $${i} OR j.position ILIKE $${i} OR array_to_string(c.skills, ' ') ILIKE $${i})`,
    );
  }

  values.push(limit);
  const limitIdx = values.length;
  values.push(offset);
  const offsetIdx = values.length;

  const { rows } = await db.query<
    DedupedCandidateAdminRow & { total_count: string }
  >(
    `WITH latest_apps AS (
       SELECT DISTINCT ON (candidate_id) *
       FROM campaign_applied
       WHERE deleted_at IS NULL
       ORDER BY candidate_id, id DESC
     )
     SELECT
       c.id, c.name, c.email, c.phone, c.degree, c.education, c.role,
       c.experience_years, c.skills, c.created_at, c.updated_at,
       la.id AS campaign_applied_id, la.job_id, j.position AS job_position,
       la.source, la.source_other, la.expected_salary,
       la.jd_match_score, la.jd_match_status, la.jd_match_error, la.jd_match_rationale,
       la.current_job_stage_mapping_id, la.current_sub_state_id,
       ps.label AS stage_label, pss.label AS sub_stage_label,
       cv.cv_storage_path, cv.original_filename AS cv_original_filename,
       cv.mime_type AS cv_mime_type, cv.parsing_status AS cv_parsing_status,
       cv.parsing_error AS cv_parsing_error, cv.parsed_payload AS cv_parsed_payload,
       cv.created_at AS cv_created_at,
       count(*) OVER() AS total_count
     FROM candidates c
     JOIN latest_apps la ON la.candidate_id = c.id
     JOIN jobs j ON j.id = la.job_id
     LEFT JOIN cv_detail_versions cv ON cv.id = la.active_cv_version_id
     LEFT JOIN job_stage_mappings jsm ON jsm.id = la.current_job_stage_mapping_id
     LEFT JOIN pipeline_stages ps ON ps.id = jsm.pipeline_stage_id
     LEFT JOIN pipeline_sub_stages pss ON pss.id = la.current_sub_state_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY COALESCE(cv.created_at, la.created_at) DESC, c.id DESC
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
