import type { CampaignAppliedAdminRow } from "@/lib/db/campaign-applied-list";
import type { JobPipelineCandidateRow } from "@/lib/jd/pipeline-types";

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { dateStyle: "medium" });
}

/**
 * Shapes a `campaign_applied` admin row into the evaluation-page view model.
 * Replaces the old `CandidateDbRow`-based `candidateDbRowToEvaluationPipelineRow`
 * -- pipeline position is now the row's own denormalized stage/sub-stage
 * columns (a real per-job config, not the fixed legacy `CandidateStatus` enum
 * this mapper used to translate into 6 buckets).
 */
export function campaignAppliedAdminRowToEvaluationRow(
  r: CampaignAppliedAdminRow,
  opts: { canViewSalary: boolean },
): JobPipelineCandidateRow {
  const major =
    [r.candidate_degree, r.candidate_education].filter(Boolean).join(" · ") ||
    "—";

  return {
    id: r.id,
    name: r.candidate_name ?? "—",
    dateOfBirth: formatDate(r.cv_date_of_birth),
    mobile: r.candidate_phone ?? "—",
    email: r.candidate_email ?? "—",
    studentYears: r.cv_student_years ?? "—",
    majorSchool: major,
    gpa: r.cv_gpa ?? "—",
    english: r.cv_english_level ?? "—",
    relatedSkills: r.candidate_skills.length > 0 ? r.candidate_skills.join(", ") : "—",
    stageLabel: r.stage_label,
    stageColor: r.stage_color,
    subStageLabel: r.sub_stage_label,
    subStageCode: r.sub_stage_code,
    subStageIsPassed: r.sub_stage_is_passed,
    expectedSalary: opts.canViewSalary ? (r.expected_salary?.trim() || null) : null,
  };
}
