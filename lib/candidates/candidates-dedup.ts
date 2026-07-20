import type { CandidateDbRow } from "@/lib/candidates/db-row";
import type { CandidatesListPagination } from "@/lib/candidates/candidates-list-query";
import {
  dedupeMatchStatusLabel,
  listDedupedCandidatesForAdmin,
  type DedupedCandidateAdminRow,
} from "@/lib/db/candidates-dedupe";
import type { QueryExecutor } from "@/lib/db/config/client";

export type DedupedCandidatesResult = {
  people: CandidateDbRow[];
  pagination: CandidatesListPagination;
  error: string | null;
};

/**
 * `row.id` is `candidates.id` (the person) -- every per-row admin action
 * (view/edit/move-stage/delete/other-applications) is keyed by
 * `campaign_applied.id` (the application) instead, so the mapped row's `id`
 * must be `row.campaign_applied_id`, not the person id. Using the person id
 * here previously made every one of those actions 404 silently.
 */
function toCandidateDbRow(row: DedupedCandidateAdminRow): CandidateDbRow {
  return {
    id: row.campaign_applied_id,
    job_opening_id: row.job_id,
    job_openings: {
      id: row.job_id,
      title: row.job_position,
      job_descriptions: { position: row.job_position },
    },
    cv_storage_path: row.cv_storage_path ?? "",
    original_filename: row.cv_original_filename ?? "",
    mime_type: row.cv_mime_type,
    parsing_status: (row.cv_parsing_status ?? "pending") as CandidateDbRow["parsing_status"],
    parsing_error: row.cv_parsing_error,
    parsed_payload: row.cv_parsed_payload,
    parsed_contact_email: row.email,
    parsed_contact_phone: row.phone,
    name: row.name,
    role: row.role,
    avatar_url: null,
    experience_years: row.experience_years,
    skills: row.skills,
    degree: row.degree,
    school: row.education,
    status: dedupeMatchStatusLabel(row),
    source: row.source ?? "Other",
    source_other: row.source_other,
    jd_match_score: row.jd_match_score,
    jd_match_status: row.jd_match_status as CandidateDbRow["jd_match_status"],
    jd_match_error: row.jd_match_error,
    jd_match_rationale: row.jd_match_rationale,
    cv_uploaded_at: row.cv_created_at ? row.cv_created_at.toISOString() : null,
    current_job_stage_mapping_id: row.current_job_stage_mapping_id,
    current_sub_state_id: row.current_sub_state_id,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    expected_salary: row.expected_salary,
  };
}

/**
 * Admin "deduped candidates" list: one row per person (dedupe-by-person is
 * inherent in the new schema, unlike the old one-row-per-upload table), each
 * enriched with their most recent application. Thin mapping layer over
 * `lib/db/candidates-dedupe.ts::listDedupedCandidatesForAdmin` -- the actual
 * query/pagination lives there; this just shapes rows into `CandidateDbRow`
 * for the existing admin table UI.
 */
export async function queryDedupedCandidatesList(
  db: QueryExecutor,
  input: {
    q?: string;
    uploadFrom?: string;
    uploadTo?: string;
    limit?: number;
    offset?: number;
  },
): Promise<DedupedCandidatesResult> {
  try {
    const { rows, total, limit, offset } = await listDedupedCandidatesForAdmin(db, input);

    return {
      people: rows.map(toCandidateDbRow),
      pagination: { limit, offset, total, hasMore: offset + rows.length < total },
      error: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database error";
    return {
      people: [],
      pagination: {
        limit: input.limit ?? 50,
        offset: input.offset ?? 0,
        total: 0,
        hasMore: false,
      },
      error: msg,
    };
  }
}
