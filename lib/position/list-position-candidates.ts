import {
  queryCandidatesList,
  type CandidatesListPagination,
  type CandidatesListQuery,
} from "@/lib/candidates/candidates-list-query";
import type { CampaignAppliedAdminRow } from "@/lib/db/campaign-applied-list";
import type { QueryExecutor } from "@/lib/db/config/client";
import { getJobById } from "@/lib/db/jobs";
import { fetchJobPipelineConfig } from "@/lib/pipelines/transition-validator";

export type MatchBand = "strong" | "good" | "partial" | "limited" | "review";
/** done = scored, scoring = queued/in progress, error = failed, none = never scored. */
export type ScoringState = "done" | "scoring" | "error" | "none";

export type PositionPipelineStage = {
  /** `job_stage_mappings.id` — what the candidate list filters on. */
  id: string;
  code: string;
  label: string;
  color: string | null;
  allowSchedule: boolean;
  subs: { id: string; code: string; label: string; isDefault: boolean; isPassed: boolean }[];
};

export type PositionCandidate = {
  /** `campaign_applied.id` */
  id: string;
  candidateId: string;
  name: string;
  /** Role + experience years (falls back to degree). */
  headline: string;
  stageMappingId: string | null;
  subStateId: string | null;
  stageLabel: string | null;
  subStageLabel: string | null;
  band: MatchBand | null;
  score: number | null;
  scoring: ScoringState;
  scoringError: string | null;
  source: string;
  /** Null when the viewer lacks salary access. */
  expectedSalary: string | null;
  appliedAt: string;
  daysInStage: number;
};

export type PositionCandidatesResult = {
  candidates: PositionCandidate[];
  pagination: CandidatesListPagination;
  pipeline: { stages: PositionPipelineStage[] };
};

export type PositionCandidatesOptions = Pick<
  CandidatesListQuery,
  "q" | "stageMappingId" | "subStateId" | "sortBy" | "sortDir" | "limit" | "offset"
> & {
  /** From `canViewSalary`; when false `expectedSalary` is nulled. */
  viewSalary: boolean;
  now?: Date;
};

const DAY_MS = 86_400_000;

/** strong ≥80, good ≥65, partial ≥50, limited below; `review` when scoring failed. */
export function scoreToBand(score: number | null, status: string | null): MatchBand | null {
  if (status === "failed") return "review";
  if (score == null) return null;
  if (score >= 80) return "strong";
  if (score >= 65) return "good";
  if (score >= 50) return "partial";
  return "limited";
}

export function matchStatusToScoring(status: string | null, score: number | null): ScoringState {
  if (status === "failed") return "error";
  if (status === "pending" || status === "processing") return "scoring";
  if (status === "completed" && score != null) return "done";
  return "none";
}

function headlineOf(row: CampaignAppliedAdminRow): string {
  const years = row.candidate_experience_years;
  const yrs = years != null && years !== "" && Number(years) > 0 ? `${Number(years)} yrs` : null;
  const parts = [row.candidate_role, yrs].filter((p): p is string => !!p);
  if (parts.length) return parts.join(" · ");
  return row.candidate_degree ?? "";
}

export function rowToPositionCandidate(
  row: CampaignAppliedAdminRow,
  opts: { viewSalary: boolean; now: Date },
): PositionCandidate {
  const scoring = matchStatusToScoring(row.jd_match_status, row.jd_match_score);
  const since = row.updated_at ?? row.created_at;
  return {
    id: row.id,
    candidateId: row.candidate_id,
    name: row.candidate_name ?? "Unnamed candidate",
    headline: headlineOf(row),
    stageMappingId: row.current_job_stage_mapping_id,
    subStateId: row.current_sub_state_id,
    stageLabel: row.stage_label,
    subStageLabel: row.sub_stage_label,
    band: scoring === "done" || scoring === "error" ? scoreToBand(row.jd_match_score, row.jd_match_status) : null,
    score: scoring === "done" ? row.jd_match_score : null,
    scoring,
    scoringError: scoring === "error" ? row.jd_match_error : null,
    source: row.source === "other" && row.source_other ? row.source_other : row.source,
    expectedSalary: opts.viewSalary ? row.expected_salary : null,
    appliedAt: row.created_at.toISOString(),
    daysInStage: Math.max(0, Math.floor((opts.now.getTime() - since.getTime()) / DAY_MS)),
  };
}

/** Candidates (applications) of a position for the new Position Management "Candidates" tab. */
export async function listPositionCandidates(
  db: QueryExecutor,
  jobId: string,
  opts: PositionCandidatesOptions,
): Promise<PositionCandidatesResult | null> {
  const job = await getJobById(db, jobId);
  if (!job || job.deleted_at) return null;

  const { viewSalary, now = new Date(), ...query } = opts;
  const [list, config] = await Promise.all([
    queryCandidatesList(db, { ...query, jobId }),
    fetchJobPipelineConfig(db, jobId),
  ]);
  if (list.error || !list.pagination) throw new Error(list.error ?? "Failed to load candidates.");

  const stages: PositionPipelineStage[] = [...config.stageMappings]
    .sort((a, b) => a.sequence_number - b.sequence_number)
    .filter((m) => m.pipeline_stages)
    .map((m) => ({
      id: m.id,
      code: m.pipeline_stages!.code,
      label: m.pipeline_stages!.label,
      color: m.pipeline_stages!.color,
      allowSchedule: m.pipeline_stages!.allow_schedule,
      subs: config.subStages
        .filter((s) => s.pipeline_stage_id === m.pipeline_stage_id)
        .sort((a, b) => a.sequence_number - b.sequence_number)
        .map((s) => ({
          id: s.id,
          code: s.code,
          label: s.label,
          isDefault: s.is_default,
          isPassed: s.is_passed,
        })),
    }));

  return {
    candidates: list.candidates.map((r) => rowToPositionCandidate(r, { viewSalary, now })),
    pagination: list.pagination,
    pipeline: { stages },
  };
}
