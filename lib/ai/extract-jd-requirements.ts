import { Output } from "ai";
import { z } from "zod";

import { normalizePhrase } from "@/lib/candidates/jd-match-formula";
import type {
  JobRequirementImportance,
  JobRequirementOrigin,
  NewJobRequirementInput,
} from "@/lib/db/job-requirements";
import {
  generateTextWithFallback,
  getConfiguredLanguageModel,
  getJdExtractModelId,
  isLlmInferenceConfigured,
  llmInferenceDisabledReason,
} from "@/lib/llm";

/**
 * Pulls a job's requirement checklist out of its JD / evaluation criteria once,
 * at JD-save time, so `lib/ai/jd-cv-match.ts` can score every candidate against
 * a fixed list instead of re-deriving one per CV (which made the checklist drift
 * between candidates on the same job).
 *
 * Distinct from `lib/ai/extract-jd.ts`, which fills the JD *form fields*.
 */

/** Same ceiling as the JD/criteria blocks in `jd-cv-match.ts`. */
const MAX_BLOCK_CHARS = 14_000;

const MAX_ITEMS = 20;

const itemSchema = z.object({
  requirement: z
    .string()
    .max(160)
    .describe(
      "One concrete requirement, condensed to a short phrase, worded as closely to the source as possible.",
    ),
  importance: z
    .enum(["must_have", "nice_to_have", "bonus"])
    .describe(
      "must_have = a hard requirement the candidate must meet; nice_to_have = preferred but not disqualifying; bonus = a pure plus.",
    ),
  origin: z
    .enum(["jd", "criteria", "ai_inferred"])
    .describe(
      "jd = explicitly written in the Job description block; criteria = explicitly written in the Evaluation criteria block; ai_inferred = implied by the role but not literally stated anywhere.",
    ),
  source_quote: z
    .string()
    .max(240)
    .describe(
      "For origin 'jd' or 'criteria': the exact words copied from that block that state this requirement. For 'ai_inferred': an empty string.",
    ),
});

const outputSchema = z.object({
  requirements: z
    .array(itemSchema)
    .min(1)
    .max(MAX_ITEMS)
    .describe("The job's concrete requirements, most important first."),
});

const SYSTEM_PROMPT = `You are an experienced technical recruiter building a hiring checklist.
Extract 5–${MAX_ITEMS} concrete requirements from the job description and the evaluation criteria below.
Keep each one close to how the source words it -- prefer must-have qualifications and hard requirements (years of experience, specific technologies, degrees, language levels) over generic phrases like "team player" or "good communication".
Do not repeat the same requirement twice; merge near-duplicates into one entry.
List the most important requirements first.

Classify each entry on two independent axes:
- importance: how hard the requirement is (must_have / nice_to_have / bonus).
- origin: where it came from.
  - "jd": the requirement is explicitly written in the Job description block. You MUST copy its exact words into source_quote.
  - "criteria": the requirement is explicitly written in the Evaluation criteria block. You MUST copy its exact words into source_quote.
  - "ai_inferred": the requirement follows reasonably from the role but is not literally stated (e.g. the JD says "Lead a team of 5" and you infer "People management experience"). Leave source_quote empty.

Never invent a quote. If you cannot copy exact words from one of the blocks, the entry is "ai_inferred".
When the evaluation criteria and the job description state the same requirement, keep one entry with origin "criteria".
Respond only with structured output.`;

function truncate(text: string): string {
  return text.length > MAX_BLOCK_CHARS
    ? text.slice(0, MAX_BLOCK_CHARS) + "\n…[truncated]"
    : text;
}

/**
 * Demotes any entry whose `source_quote` cannot actually be found in the block
 * it claims to come from. The model is reliable at reporting *which labelled
 * block* a line sat under, but not at telling "I copied this" apart from "I
 * concluded this" -- requiring a verbatim quote and then checking it turns that
 * judgement into something deterministic.
 */
function verifyOrigin(
  origin: JobRequirementOrigin,
  sourceQuote: string,
  jdNorm: string,
  criteriaNorm: string,
): JobRequirementOrigin {
  if (origin !== "jd" && origin !== "criteria") return origin;

  const needle = normalizePhrase(sourceQuote);
  if (needle.length < 3) return "ai_inferred";

  const haystack = origin === "criteria" ? criteriaNorm : jdNorm;
  return haystack.includes(needle) ? origin : "ai_inferred";
}

/**
 * Returns rows ready for `replaceExtractedJobRequirements`. `source_quote` is
 * only a verification device and is deliberately not persisted.
 *
 * Throws when the LLM is unavailable or the call fails -- the caller
 * (`lib/jd/sync-job-requirements.ts`) decides whether to surface or swallow it.
 */
export async function extractJobRequirements(
  jdText: string,
  criteriaText?: string | null,
): Promise<NewJobRequirementInput[]> {
  if (!isLlmInferenceConfigured()) {
    throw new Error(llmInferenceDisabledReason());
  }

  const jd = truncate(jdText.trim());
  const criteria = criteriaText?.trim() ? truncate(criteriaText.trim()) : "";
  if (!jd && !criteria) return [];

  const model = getConfiguredLanguageModel(getJdExtractModelId());

  const criteriaSection = criteria
    ? `\n\n## Evaluation criteria\n\n${criteria}`
    : "";

  const { output } = await generateTextWithFallback({
    model,
    output: Output.object({
      name: "job_requirements_extraction",
      description:
        "Concrete hiring requirements extracted from a job description and its evaluation criteria",
      schema: outputSchema,
    }),
    system: SYSTEM_PROMPT,
    prompt: `## Job description\n\n${jd || "(none provided)"}${criteriaSection}`,
    temperature: 0.1,
    maxOutputTokens: 2048,
  });

  const jdNorm = normalizePhrase(jd);
  const criteriaNorm = normalizePhrase(criteria);

  const seen = new Set<string>();
  const items: NewJobRequirementInput[] = [];

  /* `generateTextWithFallback` hands back a loosely typed `output`, so every
     field goes through the same defensive coercion a stored row would. */
  const raw = Array.isArray(output?.requirements) ? output.requirements : [];

  for (const entry of raw) {
    const requirement =
      typeof entry?.requirement === "string" ? entry.requirement.trim() : "";
    if (!requirement) continue;

    const key = normalizePhrase(requirement);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const importance: JobRequirementImportance =
      entry?.importance === "nice_to_have" || entry?.importance === "bonus"
        ? entry.importance
        : "must_have";

    const claimedOrigin: JobRequirementOrigin =
      entry?.origin === "criteria" || entry?.origin === "ai_inferred"
        ? entry.origin
        : "jd";

    items.push({
      requirement: requirement.slice(0, 160),
      importance,
      origin: verifyOrigin(
        claimedOrigin,
        typeof entry?.source_quote === "string" ? entry.source_quote : "",
        jdNorm,
        criteriaNorm,
      ),
    });

    if (items.length >= MAX_ITEMS) break;
  }

  return items;
}
