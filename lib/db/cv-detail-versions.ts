import type { QueryExecutor } from "@/lib/db/config/client";
import { buildSetClause } from "@/lib/db/query-helpers";

export type CvSourceEvent =
  | "initial_upload"
  | "file_replaced"
  | "manual_edit"
  | "restore";

export type CvMatchedOn =
  | "email"
  | "phone"
  | "email_or_phone"
  | "cv_content"
  | "cv_file";

/** Immutable CV file snapshot. No update/soft-delete here by design — a correction is a new version row (`source_event: "manual_edit"` or `"restore"`), never a mutation of an existing one. */
export type CvDetailVersionRow = {
  id: string;
  campaign_applied_id: string;
  version_number: number;
  source_event: CvSourceEvent;
  cv_storage_path: string | null;
  original_filename: string | null;
  mime_type: string | null;
  cv_file_sha256: string | null;
  cv_content_sha256: string | null;
  parsing_status: string | null;
  parsing_error: string | null;
  parsed_payload: unknown;
  skills: string[];
  role: string | null;
  degree: string | null;
  education: string | null;
  experience_years: string | null;
  gpa: string | null;
  english_level: string | null;
  date_of_birth: Date | null;
  student_years: string | null;
  jd_match_score: number | null;
  jd_match_status: string | null;
  jd_match_rationale: string | null;
  jd_match_error: string | null;
  jd_match_ai_score: number | null;
  jd_match_formula_score: number | null;
  jd_match_ai_weight: string | null;
  jd_match_formula_breakdown: unknown;
  jd_match_model: string | null;
  jd_match_provider: string | null;
  matched_on: CvMatchedOn | null;
  change_summary: string | null;
  created_by: string | null;
  created_at: Date;
};

export type CreateCvDetailVersionInput = {
  campaignAppliedId: string;
  versionNumber: number;
  sourceEvent: CvSourceEvent;
  cvStoragePath?: string | null;
  originalFilename?: string | null;
  mimeType?: string | null;
  cvFileSha256?: string | null;
  cvContentSha256?: string | null;
  parsingStatus?: string | null;
  parsingError?: string | null;
  parsedPayload?: unknown;
  skills?: string[];
  role?: string | null;
  degree?: string | null;
  education?: string | null;
  experienceYears?: number | null;
  gpa?: string | null;
  englishLevel?: string | null;
  dateOfBirth?: string | null;
  studentYears?: string | null;
  matchedOn?: CvMatchedOn | null;
  changeSummary?: string | null;
  createdBy?: string | null;
};

export async function getCvDetailVersionById(
  db: QueryExecutor,
  id: string,
): Promise<CvDetailVersionRow | null> {
  const { rows } = await db.query<CvDetailVersionRow>(
    `SELECT * FROM cv_detail_versions WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function listCvDetailVersionsByCampaignApplied(
  db: QueryExecutor,
  campaignAppliedId: string,
): Promise<CvDetailVersionRow[]> {
  const { rows } = await db.query<CvDetailVersionRow>(
    `SELECT * FROM cv_detail_versions
     WHERE campaign_applied_id = $1
     ORDER BY version_number DESC`,
    [campaignAppliedId],
  );
  return rows;
}

export type RecentCvDetailVersionActivity = {
  id: string;
  campaign_applied_id: string;
  source_event: CvSourceEvent;
  change_summary: string | null;
  created_at: Date;
  candidate_name: string | null;
  job_position: string;
};

/**
 * Most recent CV version rows across every application, for the admin
 * dashboard's activity feed. Replaces the old `candidate_cv_detail_version_events`
 * audit table (dropped under DB7X2K -- no equivalent table exists) with the
 * `cv_detail_versions` rows themselves: every edit/replace/restore already
 * creates a new immutable version row (see the type doc above), so that
 * history *is* the audit trail, just not previously queried as one.
 */
export async function listRecentCvDetailVersionsForAdmin(
  db: QueryExecutor,
  limit: number,
): Promise<RecentCvDetailVersionActivity[]> {
  const { rows } = await db.query<RecentCvDetailVersionActivity>(
    `SELECT cv.id, cv.campaign_applied_id, cv.source_event, cv.change_summary, cv.created_at,
            c.name AS candidate_name, j.position AS job_position
     FROM cv_detail_versions cv
     JOIN campaign_applied ca ON ca.id = cv.campaign_applied_id
     JOIN candidates c ON c.id = ca.candidate_id
     JOIN jobs j ON j.id = ca.job_id
     ORDER BY cv.id DESC
     LIMIT $1`,
    [limit],
  );
  return rows;
}

/** Next `version_number` to use for a new row on this application, per the `(campaign_applied_id, version_number)` unique constraint. Caller decides whether to re-check under a transaction if concurrent uploads for the same application are a real risk. */
export async function getNextCvVersionNumber(
  db: QueryExecutor,
  campaignAppliedId: string,
): Promise<number> {
  const { rows } = await db.query<{ next_version: number }>(
    `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version
     FROM cv_detail_versions
     WHERE campaign_applied_id = $1`,
    [campaignAppliedId],
  );
  return rows[0]?.next_version ?? 1;
}

/**
 * Atomic CAS lock for the async CV-parsing step, mirroring
 * `lockCampaignAppliedForJdMatch`'s pattern: only transitions rows currently
 * in one of `fromStatuses`, so two concurrent process calls for the same
 * version can't both proceed.
 */
export async function lockCvDetailVersionForParsing(
  db: QueryExecutor,
  id: string,
  fromStatuses: string[],
): Promise<CvDetailVersionRow | null> {
  const { rows } = await db.query<CvDetailVersionRow>(
    `UPDATE cv_detail_versions
     SET parsing_status = 'processing', parsing_error = NULL
     WHERE id = $1 AND parsing_status = ANY($2::text[])
     RETURNING *`,
    [id, fromStatuses],
  );
  return rows[0] ?? null;
}

export type UpdateCvParsingResultInput = {
  parsingStatus?: string | null;
  parsingError?: string | null;
  parsedPayload?: unknown;
  skills?: string[];
  role?: string | null;
  degree?: string | null;
  education?: string | null;
  experienceYears?: number | null;
  gpa?: string | null;
  englishLevel?: string | null;
  dateOfBirth?: string | null;
  studentYears?: string | null;
  matchedOn?: CvMatchedOn | null;
  /** Only known once the file is downloaded for parsing -- not set at upload time. */
  cvFileSha256?: string | null;
  cvContentSha256?: string | null;
};

export type UpdateCvJdMatchResultInput = {
  jdMatchScore?: number | null;
  jdMatchStatus?: string | null;
  jdMatchRationale?: string | null;
  jdMatchError?: string | null;
  jdMatchAiScore?: number | null;
  jdMatchFormulaScore?: number | null;
  jdMatchAiWeight?: number | null;
  jdMatchFormulaBreakdown?: unknown;
  jdMatchModel?: string | null;
  jdMatchProvider?: string | null;
};

/**
 * The snapshot fields below (skills, degree, parsed_payload, ...) are filled
 * once by the async CV-parsing step that follows upload — not re-editable
 * afterwards, which is what keeps a version "immutable" in the sense the
 * migration comment means. This is that one write, not a general update.
 */
export async function updateCvDetailVersionParsingResult(
  db: QueryExecutor,
  id: string,
  patch: UpdateCvParsingResultInput,
): Promise<CvDetailVersionRow | null> {
  const { clause, values } = buildSetClause(
    {
      parsing_status: patch.parsingStatus,
      parsing_error: patch.parsingError,
      parsed_payload:
        patch.parsedPayload !== undefined
          ? JSON.stringify(patch.parsedPayload)
          : undefined,
      skills: patch.skills,
      role: patch.role,
      degree: patch.degree,
      education: patch.education,
      experience_years: patch.experienceYears,
      gpa: patch.gpa,
      english_level: patch.englishLevel,
      date_of_birth: patch.dateOfBirth,
      student_years: patch.studentYears,
      matched_on: patch.matchedOn,
      cv_file_sha256: patch.cvFileSha256,
      cv_content_sha256: patch.cvContentSha256,
    },
    2,
  );
  if (!clause) return getCvDetailVersionById(db, id);

  const { rows } = await db.query<CvDetailVersionRow>(
    `UPDATE cv_detail_versions SET ${clause} WHERE id = $1 RETURNING *`,
    [id, ...values],
  );
  return rows[0] ?? null;
}

/** Async JD-match scoring result, separate from the parsing write above since it runs as its own later step (`lib/llm/jd-cv-match.ts` on the old schema). */
export async function updateCvDetailVersionJdMatchResult(
  db: QueryExecutor,
  id: string,
  patch: UpdateCvJdMatchResultInput,
): Promise<CvDetailVersionRow | null> {
  const { clause, values } = buildSetClause(
    {
      jd_match_score: patch.jdMatchScore,
      jd_match_status: patch.jdMatchStatus,
      jd_match_rationale: patch.jdMatchRationale,
      jd_match_error: patch.jdMatchError,
      jd_match_ai_score: patch.jdMatchAiScore,
      jd_match_formula_score: patch.jdMatchFormulaScore,
      jd_match_ai_weight: patch.jdMatchAiWeight,
      jd_match_formula_breakdown:
        patch.jdMatchFormulaBreakdown !== undefined
          ? JSON.stringify(patch.jdMatchFormulaBreakdown)
          : undefined,
      jd_match_model: patch.jdMatchModel,
      jd_match_provider: patch.jdMatchProvider,
    },
    2,
  );
  if (!clause) return getCvDetailVersionById(db, id);

  const { rows } = await db.query<CvDetailVersionRow>(
    `UPDATE cv_detail_versions SET ${clause} WHERE id = $1 RETURNING *`,
    [id, ...values],
  );
  return rows[0] ?? null;
}

export async function createCvDetailVersion(
  db: QueryExecutor,
  input: CreateCvDetailVersionInput,
): Promise<CvDetailVersionRow> {
  const { rows } = await db.query<CvDetailVersionRow>(
    `INSERT INTO cv_detail_versions (
       campaign_applied_id, version_number, source_event, cv_storage_path,
       original_filename, mime_type, cv_file_sha256, cv_content_sha256,
       parsing_status, parsing_error, parsed_payload, skills, role, degree,
       education, experience_years, gpa, english_level, date_of_birth,
       student_years, matched_on, change_summary, created_by
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12::text[], '{}'),
       $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
     )
     RETURNING *`,
    [
      input.campaignAppliedId,
      input.versionNumber,
      input.sourceEvent,
      input.cvStoragePath ?? null,
      input.originalFilename ?? null,
      input.mimeType ?? null,
      input.cvFileSha256 ?? null,
      input.cvContentSha256 ?? null,
      input.parsingStatus ?? null,
      input.parsingError ?? null,
      input.parsedPayload != null ? JSON.stringify(input.parsedPayload) : null,
      input.skills ?? null,
      input.role ?? null,
      input.degree ?? null,
      input.education ?? null,
      input.experienceYears ?? null,
      input.gpa ?? null,
      input.englishLevel ?? null,
      input.dateOfBirth ?? null,
      input.studentYears ?? null,
      input.matchedOn ?? null,
      input.changeSummary ?? null,
      input.createdBy ?? null,
    ],
  );
  return rows[0];
}
