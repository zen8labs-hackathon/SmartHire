import { scoreCvAgainstJobDescriptionHybrid } from "@/lib/ai/jd-cv-match";
import { computeJdMatchFormulaAnchor, aiWeightFromEnv } from "@/lib/candidates/jd-match-formula";
import { resolveJobDescriptionText } from "@/lib/candidates/resolve-job-description-text";
import { resolveJobEvaluationCriteriaText } from "@/lib/candidates/resolve-job-evaluation-criteria-text";
import {
  getCampaignAppliedById,
  lockCampaignAppliedForJdMatch,
  updateCampaignApplied,
  type UpdateCampaignAppliedInput,
} from "@/lib/db/campaign-applied";
import {
  getCvDetailVersionById,
  updateCvDetailVersionJdMatchResult,
  type UpdateCvJdMatchResultInput,
} from "@/lib/db/cv-detail-versions";
import { getCandidateById } from "@/lib/db/candidates";
import { getPool, withTransaction } from "@/lib/db/config/client";
import { getGlobalLlmModelId, parseLlmProviderId } from "@/lib/llm/config";

type ParsedPayload = {
  experienceSummary?: string | null;
  email?: string | null;
  phone?: string | null;
};

function buildCvSummary(
  row: {
    name: string | null;
    role: string | null;
    skills: string[] | null;
    degree: string | null;
    school: string | null;
    experience_years: number | string | null;
    parsed_payload: unknown;
  },
): string {
  const p = row.parsed_payload as ParsedPayload | null;
  const skills = (row.skills ?? []).join(", ");
  const parts = [
    row.name && `Name: ${row.name}`,
    row.role && `Current / target role: ${row.role}`,
    row.experience_years != null &&
      row.experience_years !== "" &&
      `Years of experience: ${row.experience_years}`,
    skills && `Skills: ${skills}`,
    row.degree && `Education: ${row.degree}`,
    row.school && `School: ${row.school}`,
    p?.experienceSummary && `Experience summary: ${p.experienceSummary}`,
    p?.email && `Email: ${p.email}`,
    p?.phone && `Phone: ${p.phone}`,
  ].filter(Boolean);
  return parts.join("\n");
}

export type JdMatchRunResult =
  | { ok: true; skipped: true; reason: string }
  | { ok: true; skipped: false; score: number }
  | { ok: false; error: string };

/**
 * Persists a JD-match result to both `campaign_applied` (cached, quick-access
 * copy) and `cv_detail_versions` (immutable per-version snapshot) atomically
 * -- these two writes must never be observed half-applied (see
 * feedback_db_transaction_n1).
 */
async function saveJdMatchResult(
  campaignAppliedId: string,
  cvVersionId: string,
  campaignPatch: UpdateCampaignAppliedInput,
  cvPatch: UpdateCvJdMatchResultInput,
): Promise<void> {
  await withTransaction(async (tx) => {
    await updateCampaignApplied(tx, campaignAppliedId, campaignPatch);
    await updateCvDetailVersionJdMatchResult(tx, cvVersionId, cvPatch);
  });
}

/**
 * Computes and stores the JD match score for an application's active CV.
 * Safe to call after CV parsing completes; no-ops or skips when inappropriate.
 */
export async function runJdMatchForCandidate(
  campaignAppliedId: string,
  options?: { force?: boolean },
): Promise<JdMatchRunResult> {
  const db = getPool();

  const campaignApplied = await getCampaignAppliedById(db, campaignAppliedId);
  if (!campaignApplied) {
    return { ok: false, error: "Application not found" };
  }

  if (!campaignApplied.active_cv_version_id) {
    return { ok: true, skipped: true, reason: "no_active_cv" };
  }

  const cvVersion = await getCvDetailVersionById(db, campaignApplied.active_cv_version_id);
  if (!cvVersion) {
    return { ok: false, error: "Active CV version not found" };
  }

  if (cvVersion.parsing_status !== "completed") {
    return { ok: true, skipped: true, reason: "parsing_not_complete" };
  }

  if (campaignApplied.jd_match_status === "processing") {
    return { ok: true, skipped: true, reason: "already_processing" };
  }

  if (campaignApplied.jd_match_status === "completed" && !options?.force) {
    return { ok: true, skipped: true, reason: "already_scored" };
  }

  const lockableStatuses = [
    "pending",
    "failed",
    "skipped",
    ...(options?.force ? ["completed"] : []),
  ];
  const locked = await lockCampaignAppliedForJdMatch(
    db,
    campaignAppliedId,
    lockableStatuses,
  );
  if (!locked) {
    return { ok: true, skipped: true, reason: "race_or_state" };
  }

  try {
    const jdText = await resolveJobDescriptionText(campaignApplied.job_id);
    const criteriaText = await resolveJobEvaluationCriteriaText(campaignApplied.job_id);
    const combinedJdText = [jdText, criteriaText ? `Evaluation criteria:\n${criteriaText}` : null]
      .filter((s): s is string => !!s?.trim())
      .join("\n\n---\n\n");

    if (!combinedJdText.trim()) {
      await saveJdMatchResult(
        campaignAppliedId,
        cvVersion.id,
        { jdMatchStatus: "skipped", jdMatchScore: null, jdMatchError: null, jdMatchRationale: null },
        { jdMatchStatus: "skipped", jdMatchScore: null, jdMatchError: null, jdMatchRationale: null },
      );
      return { ok: true, skipped: true, reason: "no_job_description_text" };
    }

    const candidate = await getCandidateById(db, campaignApplied.candidate_id);
    if (!candidate) {
      throw new Error("Candidate not found");
    }

    const cvSummary = buildCvSummary({
      name: candidate.name,
      role: cvVersion.role,
      skills: cvVersion.skills,
      degree: cvVersion.degree,
      school: cvVersion.education,
      experience_years: cvVersion.experience_years,
      parsed_payload: cvVersion.parsed_payload,
    });

    if (!cvSummary.trim()) {
      const jdMatchError = "No candidate summary available for scoring.";
      await saveJdMatchResult(
        campaignAppliedId,
        cvVersion.id,
        { jdMatchStatus: "failed", jdMatchError },
        { jdMatchStatus: "failed", jdMatchError },
      );
      return { ok: false, error: "empty_cv_summary" };
    }

    const formula = computeJdMatchFormulaAnchor({
      jdText: combinedJdText,
      cvSummary,
      skills: cvVersion.skills,
      role: cvVersion.role,
      experienceYears: cvVersion.experience_years,
    });

    const { score, rationale, aiScore, formulaScore, llmMeta } =
      await scoreCvAgainstJobDescriptionHybrid(
        cvSummary,
        jdText ?? "",
        formula,
        { criteriaText: criteriaText ?? undefined },
      );

    await saveJdMatchResult(
      campaignAppliedId,
      cvVersion.id,
      { jdMatchStatus: "completed", jdMatchScore: score, jdMatchError: null, jdMatchRationale: rationale },
      {
        jdMatchStatus: "completed",
        jdMatchScore: score,
        jdMatchError: null,
        jdMatchRationale: rationale,
        jdMatchAiScore: aiScore,
        jdMatchFormulaScore: formulaScore,
        jdMatchAiWeight: aiWeightFromEnv(),
        jdMatchFormulaBreakdown: formula.breakdown,
        jdMatchModel: llmMeta?.modelId ?? getGlobalLlmModelId(),
        jdMatchProvider: llmMeta?.provider ?? parseLlmProviderId(),
      },
    );

    return { ok: true, skipped: false, score };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const croppedMsg = msg.slice(0, 2000);

    await saveJdMatchResult(
      campaignAppliedId,
      cvVersion.id,
      { jdMatchStatus: "failed", jdMatchError: croppedMsg },
      { jdMatchStatus: "failed", jdMatchError: croppedMsg },
    );

    return { ok: false, error: msg };
  }
}
