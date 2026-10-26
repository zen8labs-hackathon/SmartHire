import type {
  JdMatchRationale,
  JdRequirementVerdict,
} from "@/lib/candidates/jd-match-rationale";
import type { CampaignAppliedRow } from "@/lib/db/campaign-applied";
import {
  requirementKey,
  type CriterionOverrideRow,
} from "@/lib/db/candidate-criterion-overrides";
import type { CvDetailVersionRow } from "@/lib/db/cv-detail-versions";
import type { JobRequirementRow } from "@/lib/db/job-requirements";

export type CriterionStatus = "meets" | "partial" | "not_met" | "unknown";

const STATUS: Record<JdRequirementVerdict, CriterionStatus> = {
  met: "meets",
  partial: "partial",
  missing: "not_met",
  unclear: "unknown",
};

export type MatchCriterion = {
  id: string;
  req: string;
  imp: string;
  origin: string;
  status: CriterionStatus;
  evidence: string;
  /** Present when a recruiter overrode the AI verdict. */
  override: {
    reason: string | null;
    original: CriterionStatus | null;
  } | null;
};

function importanceOf(source: string): string {
  if (source === "must_have" || source === "nice_to_have") return source;
  return "nice_to_have";
}

export function buildMatchView(input: {
  application: CampaignAppliedRow;
  cv: CvDetailVersionRow | null;
  rationale: JdMatchRationale | null;
  overrides: CriterionOverrideRow[];
  requirements: JobRequirementRow[];
}) {
  const { application: app, cv, rationale, overrides, requirements } = input;
  const byKey = new Map(overrides.map((o) => [o.requirement_key, o]));
  const reqByText = new Map(
    requirements.map((r) => [requirementKey(r.requirement), r]),
  );

  const criteria: MatchCriterion[] = (rationale?.requirements ?? []).map((c) => {
    const key = requirementKey(c.requirement);
    const job = reqByText.get(key);
    const o = byKey.get(key);
    return {
      id: key,
      req: c.requirement,
      imp: job?.importance ?? importanceOf(c.source),
      origin: job?.origin ?? (c.source === "criteria" ? "criteria" : "jd"),
      status: STATUS[o?.verdict ?? c.verdict],
      evidence: c.evidence,
      override: o
        ? {
            reason: o.reason,
            original: o.original_verdict ? STATUS[o.original_verdict] : null,
          }
        : null,
    };
  });

  const latestReqEdit = requirements.reduce<number>(
    (m, r) => Math.max(m, r.updated_at.getTime()),
    0,
  );

  return {
    score: app.jd_match_score,
    status: app.jd_match_status,
    error: app.jd_match_error,
    summary: rationale?.summary ?? "",
    meta: rationale?.meta ?? "",
    composition: cv
      ? {
          ai: cv.jd_match_ai_score,
          formula: cv.jd_match_formula_score,
          /** Stored as a 0-1 fraction (numeric(3,2)); the UI wants a percentage. */
          aiWeight:
            cv.jd_match_ai_weight != null
              ? Math.round(parseFloat(cv.jd_match_ai_weight) * 100)
              : null,
          breakdown: cv.jd_match_formula_breakdown,
          model: cv.jd_match_model,
          provider: cv.jd_match_provider,
        }
      : null,
    criteria,
    /** Criteria were edited after the last score was written. */
    stale: latestReqEdit > app.updated_at.getTime() && app.jd_match_score != null,
  };
}
