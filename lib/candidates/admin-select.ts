const JOB_OPENINGS_EMBED =
  "job_openings!job_opening_id ( id, title, created_at, job_descriptions ( id, position ) )";

/** Shared columns for admin candidate queries (excludes heavy `parsed_payload`). */
const ADMIN_CANDIDATES_CORE_COLUMNS = [
  "id",
  "is_active",
  "job_opening_id",
  "cv_storage_path",
  "original_filename",
  "mime_type",
  "parsing_status",
  "parsing_error",
  "name",
  "role",
  "avatar_url",
  "experience_years",
  "skills",
  "degree",
  "school",
  /* TODO: LEGACY CODE - To be removed when migrating old features */
  "status",
  "current_job_stage_mapping_id",
  "current_sub_state_id",
  "pipeline_status",
  "offered_at",
  "uploaded_by_email",
  "source",
  "source_other",
  "jd_match_score",
  "jd_match_status",
  "jd_match_error",
  "jd_match_rationale",
  "interview_at",
  "onboarding_at",
  "cv_uploaded_at",
  "created_at",
  "updated_at",
] as const;

/**
 * List / pipeline table — omits `parsed_payload` to cut payload size.
 * Use {@link ADMIN_CANDIDATES_SELECT} for detail, profile, and PATCH responses.
 */
export const ADMIN_CANDIDATES_LIST_SELECT = [
  ...ADMIN_CANDIDATES_CORE_COLUMNS,
  JOB_OPENINGS_EMBED,
].join(", ");

/** Full row including `parsed_payload` (drawer, profile, single-candidate APIs). */
export const ADMIN_CANDIDATES_SELECT = [
  ...ADMIN_CANDIDATES_CORE_COLUMNS.slice(0, 8),
  "parsed_payload",
  ...ADMIN_CANDIDATES_CORE_COLUMNS.slice(8),
  JOB_OPENINGS_EMBED,
].join(", ");

/**
 * List/pipeline table variant that includes lightweight, JSON-path-projected
 * contact fields (email/phone only) instead of the full `parsed_payload` blob.
 * Used by the JD pipeline table, which needs email/phone for search matching
 * but not the rest of the (potentially large) parsed CV payload.
 */
export const ADMIN_CANDIDATES_LIST_SELECT_WITH_CONTACT = [
  ...ADMIN_CANDIDATES_CORE_COLUMNS,
  "parsed_contact_email:parsed_payload->>email",
  "parsed_contact_phone:parsed_payload->>phone",
  JOB_OPENINGS_EMBED,
].join(", ");
