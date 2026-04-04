import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { z } from "zod";

import {
  aiWeightFromEnv,
  blendAiAndFormulaScores,
  type JdMatchFormulaResult,
} from "@/lib/candidates/jd-match-formula";

const matchOutputSchema = z.object({
  score: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe("Overall fit of the candidate to the job, 0 = no fit, 100 = excellent fit."),
  rationale: z
    .string()
    .max(880)
    .describe(
      "One short paragraph (2–4 sentences) explaining the score for an HR reader.",
    ),
});

function getGateway() {
  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("AI_GATEWAY_API_KEY is not configured.");
  }
  return createOpenAI({
    apiKey,
    baseURL: "https://ai-gateway.vercel.sh/v1",
  });
}

function gatewayModelId(): string {
  return (
    process.env.AI_GATEWAY_JD_MATCH_MODEL?.trim() || "openai/gpt-4o-mini"
  );
}

async function runLlmJdMatch(
  cv: string,
  jd: string,
  options?: { heuristicSuffix?: string },
): Promise<{ score: number; rationale: string }> {
  const gateway = getGateway();
  const model = gateway(gatewayModelId());
  const suffix = options?.heuristicSuffix?.trim() ?? "";
  const systemBase = `You are an experienced technical recruiter. Compare the candidate summary to the job description.
Score 0–100 for overall fit: required skills, experience level, education, and role alignment.
Be fair: partial overlap should yield mid scores; strong alignment with must-haves yields high scores.`;
  const systemHeuristic = suffix
    ? `\nUse the heuristic notes only as a sanity check; your judgment may differ if the checklist is incomplete.`
    : "";
  const { output } = await generateText({
    model,
    output: Output.object({
      name: "cv_jd_match",
      description: "Fit score and rationale comparing a CV to a job description",
      schema: matchOutputSchema,
    }),
    system: `${systemBase}${systemHeuristic}
Respond only with structured output.`,
    prompt: `## Job description\n\n${jd}\n\n## Candidate (from CV)\n\n${cv}${suffix}`,
    temperature: 0.2,
    maxOutputTokens: 512,
  });
  return {
    score: output.score,
    rationale: output.rationale.trim().slice(0, 880),
  };
}

/**
 * LLM-only score (no formula blend). Production matching uses {@link scoreCvAgainstJobDescriptionHybrid}.
 */
export async function scoreCvAgainstJobDescription(
  cvSummary: string,
  jobDescriptionText: string,
): Promise<{ score: number; rationale: string }> {
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
  rationale: string;
  aiScore: number;
  formulaScore: number;
};

/**
 * AI fit score blended with a deterministic anchor (skills + experience heuristics).
 * See ai-ezpassed-main `GapAnalyzer._calculate_fit_score` (60% AI / 40% formula there;
 * here default 65% AI via JD_MATCH_AI_WEIGHT).
 */
export async function scoreCvAgainstJobDescriptionHybrid(
  cvSummary: string,
  jobDescriptionText: string,
  formula: JdMatchFormulaResult,
  options?: { blend?: boolean },
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

  const formulaContext = formula.breakdown.jdHintCount
    ? `\n(Heuristic: ~${formula.breakdown.matchedHints}/${formula.breakdown.jdHintCount} requirement phrases overlap the profile; ~${formula.breakdown.candidateSkillsMatchedInJd}/${Math.max(1, formula.breakdown.candidateSkillCount)} listed skills appear in the JD.)`
    : `\n(Heuristic: ~${formula.breakdown.candidateSkillsMatchedInJd}/${Math.max(1, formula.breakdown.candidateSkillCount)} listed skills appear in the JD.)`;

  const { score: aiScore, rationale: baseRationale } = await runLlmJdMatch(cv, jd, {
    heuristicSuffix: formulaContext,
  });

  const formulaScore = formula.score;
  const score = blend
    ? blendAiAndFormulaScores(aiScore, formulaScore)
    : aiScore;

  const blendNote = blend
    ? ` Blended score: AI ${aiScore} + formula anchor ${formulaScore} (JD_MATCH_AI_WEIGHT=${String(aiWeightFromEnv())}).`
    : "";
  const rationale = (baseRationale + blendNote).slice(0, 1000);

  return {
    score,
    rationale,
    aiScore,
    formulaScore,
  };
}
