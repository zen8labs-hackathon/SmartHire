import type { CampaignAppliedAdminRow } from "@/lib/db/campaign-applied-list";
import { formatCandidateSourceLabel } from "@/lib/candidates/source-constants";

/**
 * Client-safe shape of `CampaignAppliedAdminRow`: `pg` returns timestamp
 * columns as real `Date` objects, which only survive intact when this row
 * crosses the Server->Client boundary via React's Flight serialization
 * (`use()` on a promise passed as a prop). Once a row instead comes back
 * through a `fetch()` call (JSON.parse), those fields are already plain ISO
 * strings. Standardizing on `string` here (converted once via
 * {@link toJdPipelineApplicationRow} at the RSC boundary) keeps both paths
 * consistent -- same class of bug as the `Date`-vs-`string` fix in the JD
 * list/enrichment layer.
 */
export type JdPipelineApplicationRow = Omit<
  CampaignAppliedAdminRow,
  "created_at" | "updated_at" | "hired_at" | "cv_created_at"
> & {
  created_at: string;
  updated_at: string;
  hired_at: string | null;
  cv_created_at: string | null;
};

export function toJdPipelineApplicationRow(
  r: CampaignAppliedAdminRow,
): JdPipelineApplicationRow {
  return {
    ...r,
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
    hired_at: r.hired_at ? r.hired_at.toISOString() : null,
    cv_created_at: r.cv_created_at ? r.cv_created_at.toISOString() : null,
  };
}

export type JdPipelineTableRow = {
  id: string;
  name: string;
  role: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  experienceYears: number;
  skills: string[];
  /** Extra skills count shown as "+N" when more than `visible` tags. */
  moreSkills?: number;
  degree: string;
  school: string;
  gpa: string;
  englishLevel: string;
  sourceLabel: string;
  jdMatchScore: number | null;
  jdMatchLabel: string;
  cvUploadedAtIso: string | null;
};

function jdMatchLabelFromRow(r: JdPipelineApplicationRow): {
  score: number | null;
  label: string;
} {
  const status = r.jd_match_status ?? "pending";
  const score = r.jd_match_score;
  if (status === "completed" && score != null && Number.isFinite(score)) {
    return { score, label: String(Math.round(score)) };
  }
  if (status === "processing") return { score: null, label: "Scoring…" };
  if (status === "failed") return { score: null, label: "Error" };
  if (status === "skipped") return { score: null, label: "N/A" };
  return { score: null, label: "Pending" };
}

/**
 * Shapes a `campaign_applied` admin row into the JD pipeline table's display
 * fields. Distinct from `candidateDbRowToTableRow` (the pre-DB7X2K mapper,
 * still used by the not-yet-migrated candidate-profile-dashboard) --
 * `CampaignAppliedAdminRow` has no `avatar_url`/`parsed_payload`/legacy
 * `status` columns, so this intentionally doesn't try to reproduce every
 * field of the old `CandidateRow`.
 */
export function campaignAppliedAdminRowToTableRow(
  r: JdPipelineApplicationRow,
): JdPipelineTableRow {
  const skills = r.candidate_skills ?? [];
  const visible = skills.slice(0, 3);
  const more = skills.length > 3 ? skills.length - 3 : undefined;
  const experienceYears =
    r.candidate_experience_years == null || r.candidate_experience_years === ""
      ? 0
      : Number(r.candidate_experience_years);

  const parsing = r.cv_parsing_status;
  const fallbackFilename = r.cv_original_filename ?? "CV";
  const name =
    parsing === "completed" && r.candidate_name?.trim()
      ? r.candidate_name.trim()
      : parsing === "failed"
        ? `Failed: ${fallbackFilename}`
        : parsing === "processing" || parsing === "pending"
          ? `Processing: ${fallbackFilename}`
          : r.candidate_name?.trim() || fallbackFilename;

  const role =
    parsing === "completed" && r.candidate_role?.trim()
      ? r.candidate_role.trim()
      : parsing === "failed"
        ? (r.cv_parsing_error ?? "Parse error").slice(0, 80)
        : "CV ingest";

  const { score: jdMatchScore, label: jdMatchLabel } = jdMatchLabelFromRow(r);

  return {
    id: r.id,
    name,
    role,
    email: r.candidate_email,
    phone: r.candidate_phone,
    avatarUrl: null,
    experienceYears,
    skills: visible,
    moreSkills: more,
    degree: r.candidate_degree?.trim() || "—",
    school: r.candidate_education?.trim() || "—",
    gpa: r.cv_gpa?.trim() || "—",
    englishLevel: r.cv_english_level?.trim() || "—",
    sourceLabel: formatCandidateSourceLabel(r.source ?? "Other", r.source_other),
    jdMatchScore,
    jdMatchLabel,
    cvUploadedAtIso: r.cv_created_at ?? r.created_at,
  };
}
