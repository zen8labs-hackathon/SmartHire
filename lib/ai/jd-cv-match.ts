import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { z } from "zod";

const matchOutputSchema = z.object({
  score: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe("Overall fit of the candidate to the job, 0 = no fit, 100 = excellent fit."),
  rationale: z
    .string()
    .max(800)
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

/**
 * Scores how well the candidate profile fits the job description (Vercel AI Gateway).
 */
export async function scoreCvAgainstJobDescription(
  cvSummary: string,
  jobDescriptionText: string,
): Promise<{ score: number; rationale: string }> {
  const gateway = getGateway();
  const model = gateway(gatewayModelId());

  const cv =
    cvSummary.length > 14_000
      ? cvSummary.slice(0, 14_000) + "\n…[truncated]"
      : cvSummary;
  const jd =
    jobDescriptionText.length > 14_000
      ? jobDescriptionText.slice(0, 14_000) + "\n…[truncated]"
      : jobDescriptionText;

  const { output } = await generateText({
    model,
    output: Output.object({
      name: "cv_jd_match",
      description: "Fit score and rationale comparing a CV to a job description",
      schema: matchOutputSchema,
    }),
    system: `You are an experienced technical recruiter. Compare the candidate summary to the job description.
Score 0–100 for overall fit: required skills, experience level, education, and role alignment.
Be fair: partial overlap should yield mid scores; strong alignment with must-haves yields high scores.
Respond only with structured output.`,
    prompt: `## Job description\n\n${jd}\n\n## Candidate (from CV)\n\n${cv}`,
    temperature: 0.2,
    maxOutputTokens: 512,
  });

  return {
    score: output.score,
    rationale: output.rationale.trim().slice(0, 800),
  };
}
