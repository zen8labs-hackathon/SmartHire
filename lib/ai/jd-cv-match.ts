import { Output } from "ai";
import { z } from "zod";

import {
  aiWeightFromEnv,
  blendAiAndFormulaScores,
  type JdMatchFormulaResult,
} from "@/lib/candidates/jd-match-formula";
import {
  encodeJdMatchRationale,
  normalizeJdRequirements,
  type JdRequirementCheck,
} from "@/lib/candidates/jd-match-rationale";
import {
  formatLlmCallLabel,
  generateTextWithFallback,
  getConfiguredLanguageModel,
  isLlmInferenceConfigured,
  llmInferenceDisabledReason,
  type LlmCallMeta,
} from "@/lib/llm";

const requirementCheckSchema = z.object({
  requirement: z
    .string()
    .max(160)
    .describe(
      "One concrete requirement taken from the job description or evaluation criteria, condensed to a short phrase.",
    ),
  source: z
    .enum(["must_have", "nice_to_have", "criteria", "other"])
    .describe(
      "Where the requirement came from: the JD's must-have list, its nice-to-have list, the evaluation criteria, or elsewhere in the JD.",
    ),
  verdict: z
    .enum(["met", "partial", "missing", "unclear"])
    .describe(
      "met = the candidate summary clearly satisfies it; partial = partially satisfied; missing = the summary shows it is not satisfied; unclear = the summary says nothing either way.",
    ),
  evidence: z
    .string()
    .max(240)
    .describe(
      "The supporting detail from the candidate summary, or a short note on what is absent. Never invent details that are not in the summary.",
    ),
});

/**
 * `requirements` is listed before `rationale`/`score` on purpose: structured
 * output is generated in field order, so the model works through the checklist
 * first and only then summarizes and scores.
 */
const matchOutputSchema = z.object({
  requirements: z
    .array(requirementCheckSchema)
    .min(1)
    .max(12)
    .describe(
      "The job's concrete requirements, each checked against the candidate summary.",
    ),
  rationale: z
    .string()
    .max(600)
    .describe(
      "One short paragraph (2–4 sentences) explaining the score for an HR reader.",
    ),
  score: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe("Overall fit of the candidate to the job, 0 = no fit, 100 = excellent fit."),
});

type LlmJdMatchResult = {
  score: number;
  rationale: string;
  requirements: JdRequirementCheck[];
  llmMeta: LlmCallMeta;
};

async function runLlmJdMatch(
  cv: string,
  jd: string,
  options?: { heuristicSuffix?: string; criteriaText?: string },
): Promise<LlmJdMatchResult> {
  const model = getConfiguredLanguageModel();
  const suffix = options?.heuristicSuffix?.trim() ?? "";
  const criteriaText = options?.criteriaText?.trim();
  const systemBase = `You are an experienced technical recruiter. Compare the candidate summary to the job description.
First extract 5–12 concrete requirements from the job description (and the evaluation criteria when present), keeping each one close to how the job description words it -- prefer must-have qualifications and hard requirements over generic phrases like "team player".
Check every extracted requirement against the candidate summary and give it a verdict with the supporting evidence from that summary.
Ground every verdict in the candidate summary: when it says nothing about a requirement, use "unclear" and say so rather than inventing experience the candidate may not have.
Then score 0–100 for overall fit: required skills, experience level, education, and role alignment.
Be fair: partial overlap should yield mid scores; strong alignment with must-haves yields high scores.
The score must be consistent with the checklist -- mostly "met" must-haves cannot end up with a low score, and several "missing" must-haves cannot end up with a high one.`;
  // Evaluation criteria is hiring-manager-defined for this specific job, so it
  // outranks the general JD text when the two disagree.
  const systemCriteria = criteriaText
    ? `\nIf the evaluation criteria conflicts with the general job description, the evaluation criteria takes precedence -- treat it as a hard requirement.`
    : "";
  const systemHeuristic = suffix
    ? `\nUse the heuristic notes only as a sanity check; your judgment may differ if the checklist is incomplete.`
    : "";
  const criteriaSection = criteriaText
    ? `\n\n## Evaluation criteria (hard requirements -- takes precedence over the job description above if they conflict)\n\n${criteriaText}`
    : "";
  const { output, llmMeta } = await generateTextWithFallback({
    model,
    output: Output.object({
      name: "cv_jd_match",
      description:
        "Per-requirement checklist, fit score and rationale comparing a CV to a job description",
      schema: matchOutputSchema,
    }),
    system: `${systemBase}${systemCriteria}${systemHeuristic}
Respond only with structured output.`,
    prompt: `## Job description\n\n${jd}${criteriaSection}\n\n## Candidate (from CV)\n\n${cv}${suffix}`,
    temperature: 0.2,
    /* Up to 12 checklist entries plus the summary no longer fit in 512. */
    maxOutputTokens: 1600,
  });
  return {
    score: output.score,
    rationale: output.rationale.trim().slice(0, 880),
    /* `generateTextWithFallback` hands back a loosely typed `output`, so the
       checklist goes through the same defensive coercion as a stored one. */
    requirements: normalizeJdRequirements(output.requirements),
    llmMeta,
  };
}

/**
 * LLM-only score (no formula blend). Production matching uses {@link scoreCvAgainstJobDescriptionHybrid}.
 */
export async function scoreCvAgainstJobDescription(
  cvSummary: string,
  jobDescriptionText: string,
): Promise<LlmJdMatchResult> {
  if (!isLlmInferenceConfigured()) {
    throw new Error(llmInferenceDisabledReason());
  }
  const cv =
    cvSummary.length > 14_000
      ? cvSummary.slice(0, 14_000) + "\n…[truncated]"
      : cvSummary;
  const jd =
    jobDescriptionText.length > 14_000
      ? jobDescriptionText.slice(0, 14_000) + "\n…[truncated]"
      : jobDescriptionText;
  return runLlmJdMatch(cv, jd);
}

export type HybridJdMatchResult = {
  score: number;
  /**
   * JSON envelope (see `lib/candidates/jd-match-rationale.ts`) when the LLM
   * produced a checklist; plain prose on the formula-only fallbacks below,
   * which `parseJdMatchRationale` also accepts.
   */
  rationale: string;
  /** Empty on the formula-only fallbacks -- no LLM ran, so nothing was checked. */
  requirements: JdRequirementCheck[];
  aiScore: number;
  formulaScore: number;
  /** Set when an LLM call succeeded (primary or Vercel fallback). */
  llmMeta: LlmCallMeta | null;
};

/**
 * AI fit score blended with a deterministic anchor (skills + experience heuristics).
 * See ai-ezpassed-main `GapAnalyzer._calculate_fit_score` (60% AI / 40% formula there;
 * here default 65% AI via JD_MATCH_AI_WEIGHT).
 *
 * When the LLM is not configured or the AI call fails, the final score falls back to
 * the formula anchor only (same numeric value as `formula.score`).
 */
export async function scoreCvAgainstJobDescriptionHybrid(
  cvSummary: string,
  jobDescriptionText: string,
  formula: JdMatchFormulaResult,
  options?: { blend?: boolean; criteriaText?: string },
): Promise<HybridJdMatchResult> {
  const blend = options?.blend !== false;

  const cv =
    cvSummary.length > 14_000
      ? cvSummary.slice(0, 14_000) + "\n…[truncated]"
      : cvSummary;
  const jd =
    jobDescriptionText.length > 14_000
      ? jobDescriptionText.slice(0, 14_000) + "\n…[truncated]"
      : jobDescriptionText;
  const criteriaText =
    options?.criteriaText && options.criteriaText.length > 14_000
      ? options.criteriaText.slice(0, 14_000) + "\n…[truncated]"
      : options?.criteriaText;

  const formulaContext = formula.breakdown.jdHintCount
    ? `\n(Heuristic: ~${formula.breakdown.matchedHints}/${formula.breakdown.jdHintCount} requirement phrases overlap the profile; ~${formula.breakdown.candidateSkillsMatchedInJd}/${Math.max(1, formula.breakdown.candidateSkillCount)} listed skills appear in the JD.)`
    : `\n(Heuristic: ~${formula.breakdown.candidateSkillsMatchedInJd}/${Math.max(1, formula.breakdown.candidateSkillCount)} listed skills appear in the JD.)`;

  const formulaScore = formula.score;

  if (!isLlmInferenceConfigured()) {
    const note = llmInferenceDisabledReason();
    const rationale = `${formula.summary} ${note} Using formula anchor only (score ${formulaScore}).`.slice(
      0,
      1000,
    );
    return {
      score: formulaScore,
      rationale,
      requirements: [],
      aiScore: formulaScore,
      formulaScore,
      llmMeta: null,
    };
  }

  let aiScore: number;
  let baseRationale: string;
  let requirements: JdRequirementCheck[];
  let llmMeta: LlmCallMeta;
  try {
    const out = await runLlmJdMatch(cv, jd, {
      heuristicSuffix: formulaContext,
      criteriaText,
    });
    aiScore = out.score;
    baseRationale = out.rationale;
    requirements = out.requirements;
    llmMeta = out.llmMeta;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const rationale =
      `${formula.summary} AI scoring failed; using formula anchor only (${msg.slice(0, 240)}). Score ${formulaScore}.`.slice(
        0,
        1000,
      );
    return {
      score: formulaScore,
      rationale,
      requirements: [],
      aiScore: formulaScore,
      formulaScore,
      llmMeta: null,
    };
  }

  const score = blend
    ? blendAiAndFormulaScores(aiScore, formulaScore)
    : aiScore;

  const modelNote = `AI model: ${formatLlmCallLabel(llmMeta)}.`;
  const blendNote = blend
    ? `\nBlended score: AI ${aiScore} + formula anchor ${formulaScore} (JD_MATCH_AI_WEIGHT=${String(aiWeightFromEnv())}).`
    : "";
  const rationale = encodeJdMatchRationale({
    summary: baseRationale,
    meta: modelNote + blendNote,
    requirements,
  });

  return {
    score,
    rationale,
    requirements,
    aiScore,
    formulaScore,
    llmMeta,
  };
}
