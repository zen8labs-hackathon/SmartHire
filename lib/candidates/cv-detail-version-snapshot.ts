/**
 * Full rollback snapshot for CV detail versioning (profile edits + restore).
 * Stored in `candidate_cv_detail_version_events.snapshot` (jsonb).
 */

/** Columns to load before archiving a candidate row into an event snapshot. */
export const CV_DETAIL_SNAPSHOT_SELECT = [
  "cv_storage_path",
  "original_filename",
  "mime_type",
  "parsing_status",
  "parsing_error",
  "parsed_payload",
  "name",
  "role",
  "experience_years",
  "skills",
  "degree",
  "school",
  "source",
  "source_other",
  "cv_uploaded_at",
  "cv_file_sha256",
  "cv_content_sha256",
  "jd_match_score",
  "jd_match_status",
  "jd_match_error",
  "jd_match_rationale",
  "avatar_url",
  "source",
  "source_other",
].join(", ");

export type CvDetailRollbackSnapshot = {
  cv_storage_path: string | null;
  original_filename: string | null;
  mime_type: string | null;
  parsing_status: string | null;
  parsing_error: string | null;
  parsed_payload: unknown;
  name: string | null;
  role: string | null;
  experience_years: number | string | null;
  skills: string[] | null;
  degree: string | null;
  school: string | null;
  source: string | null;
  source_other: string | null;
  cv_uploaded_at: string | null;
  cv_file_sha256: string | null;
  cv_content_sha256: string | null;
  jd_match_score: number | null;
  jd_match_status: string | null;
  jd_match_error: string | null;
  jd_match_rationale: string | null;
  avatar_url: string | null;
};

export function snapshotFromCandidateRow(
  row: Record<string, unknown>,
): CvDetailRollbackSnapshot {
  return {
    cv_storage_path: (row.cv_storage_path as string | null) ?? null,
    original_filename: (row.original_filename as string | null) ?? null,
    mime_type: (row.mime_type as string | null) ?? null,
    parsing_status: (row.parsing_status as string | null) ?? null,
    parsing_error: (row.parsing_error as string | null) ?? null,
    parsed_payload: row.parsed_payload ?? null,
    name: (row.name as string | null) ?? null,
    role: (row.role as string | null) ?? null,
    experience_years:
      (row.experience_years as number | string | null | undefined) ?? null,
    skills: Array.isArray(row.skills)
      ? [...(row.skills as string[])]
      : null,
    degree: (row.degree as string | null) ?? null,
    school: (row.school as string | null) ?? null,
    source: (row.source as string | null) ?? null,
    source_other: (row.source_other as string | null) ?? null,
    cv_uploaded_at: (row.cv_uploaded_at as string | null) ?? null,
    cv_file_sha256: (row.cv_file_sha256 as string | null) ?? null,
    cv_content_sha256: (row.cv_content_sha256 as string | null) ?? null,
    jd_match_score:
      row.jd_match_score == null ? null : Number(row.jd_match_score),
    jd_match_status: (row.jd_match_status as string | null) ?? null,
    jd_match_error: (row.jd_match_error as string | null) ?? null,
    jd_match_rationale: (row.jd_match_rationale as string | null) ?? null,
    avatar_url: (row.avatar_url as string | null) ?? null,
  };
}

/** Supabase `.update()` payload from a rollback snapshot. */
export function rowUpdateFromCvDetailSnapshot(
  snap: CvDetailRollbackSnapshot,
): Record<string, unknown> {
  return {
    cv_storage_path: snap.cv_storage_path,
    original_filename: snap.original_filename,
    mime_type: snap.mime_type,
    parsing_status: snap.parsing_status,
    parsing_error: snap.parsing_error,
    parsed_payload: snap.parsed_payload,
    name: snap.name,
    role: snap.role,
    experience_years: snap.experience_years,
    skills: snap.skills,
    degree: snap.degree,
    school: snap.school,
    source: snap.source,
    source_other: snap.source_other,
    cv_uploaded_at: snap.cv_uploaded_at,
    cv_file_sha256: snap.cv_file_sha256,
    cv_content_sha256: snap.cv_content_sha256,
    jd_match_score: snap.jd_match_score,
    jd_match_status: snap.jd_match_status,
    jd_match_error: snap.jd_match_error,
    jd_match_rationale: snap.jd_match_rationale,
    avatar_url: snap.avatar_url,
  };
}
