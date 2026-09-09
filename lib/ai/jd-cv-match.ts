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
import { logError, toError } from "@/lib/logger";

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

/**
 * Variant used when the job already has a stored checklist
 * (`job_requirements`): the model no longer decides *what* the requirements
 * are, only how the candidate measures up, so each verdict just points back at
 * a numbered checklist row.
 */
const fixedRequirementVerdictSchema = z.object({
  index: z
    .number()
    .int()
    .describe("The 1-based number of the checklist item this verdict is for."),
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

const fixedMatchOutputSchema = z.object({
  verdicts: z
    .array(fixedRequirementVerdictSchema)
    .describe(
      "One entry for every checklist item, in the order they were given.",
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

/** A stored `job_requirements` row, narrowed to what scoring needs. */
export type FixedJdRequirement = {
  requirement: string;
  importance: "must_have" | "nice_to_have" | "bonus";
  origin: "jd" | "criteria" | "ai_inferred" | "manual";
};

/**
 * Projects a stored requirement onto the display enum the rationale envelope
 * and pipeline modal already speak. `JdRequirementSource` predates the
 * importance/origin split and mixes both axes, so provenance wins where it is
 * the more useful label (a hiring-manager criterion), importance otherwise.
 */
function fixedRequirementToSource(
  req: FixedJdRequirement,
): JdRequirementCheck["source"] {
  if (req.origin === "criteria") return "criteria";
  return req.importance === "must_have" ? "must_have" : "nice_to_have";
}

type LlmJdMatchResult = {
  score: number;
  rationale: string;
  requirements: JdRequirementCheck[];
  llmMeta: LlmCallMeta;
};

const IMPORTANCE_LABEL: Record<FixedJdRequirement["importance"], string> = {
  must_have: "MUST-HAVE",
  nice_to_have: "nice-to-have",
  bonus: "bonus",
};

/**
 * Scores against the job's stored checklist instead of one the model invents
 * per call. Two things improve: every candidate on a job is judged against the
 * same list (previously it drifted from CV to CV), and a recruiter can correct
 * the list once instead of re-prompting.
 *
 * The model returns verdicts keyed by checklist number rather than re-stating
 * the requirements, so it cannot quietly drop, merge, or reword an item.
 */
async function runLlmJdMatchWithFixedChecklist(
  cv: string,
  jd: string,
  requirements: FixedJdRequirement[],
  options?: { heuristicSuffix?: string; criteriaText?: string },
): Promise<LlmJdMatchResult> {
  const model = getConfiguredLanguageModel();
  const suffix = options?.heuristicSuffix?.trim() ?? "";
  const criteriaText = options?.criteriaText?.trim();

  const system = `You are an experienced technical recruiter. Compare the candidate summary to the job's requirement checklist.
The checklist is fixed and authoritative: give a verdict for EVERY numbered item, and do not add, drop, merge, or reword items.
Ground every verdict in the candidate summary: when it says nothing about a requirement, use "unclear" rather than inventing experience the candidate may not have.
Then score 0–100 for overall fit.
Weigh the items by their marked importance: MUST-HAVE items dominate the score, nice-to-have items adjust it, bonus items can only help.
The score must be consistent with the verdicts -- mostly "met" must-haves cannot end up with a low score, and several "missing" must-haves cannot end up with a high one.${
    suffix
      ? `\nUse the heuristic notes only as a sanity check; your judgment may differ.`
      : ""
  }
Respond only with structured output.`;

  const checklist = requirements
    .map(
      (r, i) => `${i + 1}. [${IMPORTANCE_LABEL[r.importance]}] ${r.requirement}`,
    )
    .join("\n");

  /* The JD and criteria stay in the prompt as background: the checklist says
     what to check, but the model still needs the surrounding text to judge
     adjacent experience fairly (e.g. what the team's stack actually is). */
  const criteriaSection = criteriaText
    ? `\n\n## Evaluation criteria (background)\n\n${criteriaText}`
    : "";

  const { output, llmMeta } = await generateTextWithFallback({
    model,
    output: Output.object({
      name: "cv_jd_checklist_match",
      description:
        "Per-requirement verdicts, fit score and rationale for a CV against a fixed job requirement checklist",
      schema: fixedMatchOutputSchema,
    }),
    system,
    prompt: `## Requirement checklist (give a verdict for each)\n\n${checklist}\n\n## Job description (background)\n\n${jd}${criteriaSection}\n\n## Candidate (from CV)\n\n${cv}${suffix}`,
    temperature: 0.2,
    maxOutputTokens: 1600,
  });

  const byIndex = new Map<number, { verdict: string; evidence: string }>();
  const rawVerdicts: unknown[] = Array.isArray(output?.verdicts)
    ? output.verdicts
    : [];
  rawVerdicts.forEach((raw, position) => {
    const v = raw as { index?: unknown; verdict?: unknown; evidence?: unknown };
    /* Prefer the model's own numbering, but fall back to array position so a
       model that omits `index` still lines up instead of losing every verdict. */
    const n = Number.isInteger(v?.index) ? Number(v.index) : position + 1;
    if (n < 1 || n > requirements.length || byIndex.has(n)) return;
    byIndex.set(n, {
      verdict: typeof v?.verdict === "string" ? v.verdict : "unclear",
      evidence: typeof v?.evidence === "string" ? v.evidence : "",
    });
  });

  /* Built from the stored checklist, not the model's echo: an item the model
     skipped still appears, as "unclear". */
  const checks = requirements.map((req, i) => {
    const got = byIndex.get(i + 1);
    return {
      requirement: req.requirement,
      source: fixedRequirementToSource(req),
      verdict: got?.verdict ?? "unclear",
      evidence: got?.evidence ?? "",
    };
  });

  return {
    score: output.score,
    rationale: output.rationale.trim().slice(0, 880),
    requirements: normalizeJdRequirements(checks),
    llmMeta,
  };
}

async function runLlmJdMatch(
  cv: string,
  jd: string,
  options?: {
    heuristicSuffix?: string;
    criteriaText?: string;
    fixedRequirements?: FixedJdRequirement[];
  },
): Promise<LlmJdMatchResult> {
  const fixedRequirements = options?.fixedRequirements ?? [];
  if (fixedRequirements.length > 0) {
    return runLlmJdMatchWithFixedChecklist(cv, jd, fixedRequirements, options);
  }

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
  options?: {
    blend?: boolean;
    criteriaText?: string;
    /**
     * The job's stored `job_requirements` checklist. When present the model
     * checks these instead of deriving its own list per candidate; when empty
     * or omitted, scoring falls back to the original self-extracting prompt.
     */
    fixedRequirements?: FixedJdRequirement[];
  },
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
      fixedRequirements: options?.fixedRequirements,
    });
    aiScore = out.score;
    baseRationale = out.rationale;
    requirements = out.requirements;
    llmMeta = out.llmMeta;
  } catch (e) {
    logError("JD-CV match AI failed, formula only", toError(e));
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
