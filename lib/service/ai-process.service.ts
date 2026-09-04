import {
  scoreCvAgainstJobDescriptionHybrid,
  type HybridJdMatchResult,
} from "@/lib/ai/jd-cv-match";
import { parseResumeWithAI, type ParsedResume } from "@/lib/ai/parse-resume";
import { computeJdMatchFormulaAnchor } from "@/lib/candidates/jd-match-formula";
import { resolveJobDescriptionText } from "@/lib/candidates/resolve-job-description-text";
import { resolveJobEvaluationCriteriaText } from "@/lib/candidates/resolve-job-evaluation-criteria-text";
import { toError } from "../logger";

/** Same field order/labels as `buildCvSummary` in lib/candidates/jd-match.ts -- keep both in sync if either changes. */
function buildCvSummaryFromParsedResume(parsed: ParsedResume): string {
  const parts = [
    parsed.name && `Name: ${parsed.name}`,
    parsed.role && `Current / target role: ${parsed.role}`,
    parsed.experienceYears != null &&
      `Years of experience: ${parsed.experienceYears}`,
    parsed.skills.length > 0 && `Skills: ${parsed.skills.join(", ")}`,
    parsed.degree && `Education: ${parsed.degree}`,
    parsed.school && `School: ${parsed.school}`,
    parsed.englishLevel && `English level: ${parsed.englishLevel}`,
    parsed.gpa && `GPA: ${parsed.gpa}`,
    parsed.experienceSummary &&
      `Experience summary: ${parsed.experienceSummary}`,
    parsed.email && `Email: ${parsed.email}`,
    parsed.phone && `Phone: ${parsed.phone}`,
  ].filter(Boolean);
  return parts.join("\n");
}

/// ==== AI processing service ====
export const AIProcessService = {
  classifyAiError: (
    e: unknown,
  ): {
    errorCode: number;
    errorMessage: string;
  } => {
    const msg = toError(e)?.message ?? String(e);
    const lower = msg.toLowerCase();

    if (lower.includes("timed out")) {
      return { errorCode: 504, errorMessage: msg };
    }
    if (lower.includes("not configured") || lower.includes("disabled")) {
      return { errorCode: 503, errorMessage: msg };
    }
    if (
      lower.includes("no job description text") ||
      lower.includes("empty cv summary")
    ) {
      return { errorCode: 422, errorMessage: msg };
    }
    // Anything else (network error, invalid API key, malformed structured
    // output, rate limit, ...) is the upstream AI provider misbehaving.
    return { errorCode: 502, errorMessage: msg };
  },

  /** Extracts structured candidate data (name/skills/experience/etc) from raw CV text via the configured LLM. */
  semanticParsing: async (text: string): Promise<ParsedResume> => {
    return parseResumeWithAI(text);
  },

  /**
   * Hybrid formula+AI CV-JD match score for a resume against one job's JD.
   * Takes a jobId + already-parsed resume rather than a campaignAppliedId --
   * the upload worker calls this before any `campaign_applied` row exists
   * (that's created later in the pipeline), so it can't reuse
   * `runJdMatchForCandidate` (lib/candidates/jd-match.ts), which resolves
   * everything from that row instead.
   */
  evaluateCv: async (
    jobId: string,
    parsed: ParsedResume,
  ): Promise<HybridJdMatchResult> => {
    const jdText = await resolveJobDescriptionText(jobId);
    if (!jdText?.trim()) {
      throw new Error(
        `Job ${jobId} has no job description text to match against`,
      );
    }

    const cvSummary = buildCvSummaryFromParsedResume(parsed);
    if (!cvSummary.trim()) {
      throw new Error("Parsed resume produced an empty CV summary");
    }

    const criteriaText = await resolveJobEvaluationCriteriaText(jobId);
    const formula = computeJdMatchFormulaAnchor({
      jdText,
      cvSummary,
      skills: parsed.skills,
      role: parsed.role,
      experienceYears: parsed.experienceYears,
    });

    const result = await scoreCvAgainstJobDescriptionHybrid(
      cvSummary,
      jdText,
      formula,
      { criteriaText: criteriaText ?? undefined },
    );

    if (!result.llmMeta) {
      throw new Error(result.rationale);
    }

    return result;
  },
};
