import type { CampaignAppliedAdminRow } from "@/lib/db/campaign-applied-list";
import type { JobPipelineCandidateRow } from "@/lib/jd/pipeline-types";
import { formatCandidateSourceLabel } from "@/lib/candidates/source-constants";
import {
  resolveCandidatePipelineIds,
  type StageMapping,
  type SubStage,
} from "@/lib/pipelines/transition-validator";

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
  opts: {
    canViewSalary: boolean;
    stageMappings: StageMapping[];
    subStages: SubStage[];
  },
): JobPipelineCandidateRow {
  const major =
    [r.candidate_degree, r.candidate_education].filter(Boolean).join(" · ") ||
    "—";

  // A brand-new application has `current_job_stage_mapping_id`/
  // `current_sub_state_id` both `NULL` until it's explicitly moved. The
  // pipeline table displays those as sitting in the job's first stage's
  // default sub-stage (see `resolveCandidatePipelineIds`) rather than "not
  // started" -- resolve the same way here instead of trusting the row's own
  // (possibly-NULL) `stage_label`/`sub_stage_label` columns, so this page
  // doesn't disagree with the table for the exact same candidate.
  const { stageMappingId, subStateId } = resolveCandidatePipelineIds(
    r,
    opts.stageMappings,
    opts.subStages,
  );
  const stageMapping = opts.stageMappings.find((sm) => sm.id === stageMappingId);
  const subStage = opts.subStages.find((ss) => ss.id === subStateId);

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
    stageLabel: stageMapping?.pipeline_stages?.label ?? null,
    stageColor: stageMapping?.pipeline_stages?.color ?? null,
    subStageLabel: subStage?.label ?? null,
    subStageCode: subStage?.code ?? null,
    subStageIsPassed: subStage?.is_passed ?? null,
    expectedSalary: opts.canViewSalary ? (r.expected_salary?.trim() || null) : null,
    sourceLabel: formatCandidateSourceLabel(r.source, r.source_other),
  };
}
