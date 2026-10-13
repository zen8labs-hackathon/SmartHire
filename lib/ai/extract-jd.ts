import { Output } from "ai";
import { z } from "zod";
import type { JobDescriptionFormData } from "@/lib/jd/types";
import { normalizeFormText } from "@/lib/jd/normalize-text";
import {
  parseJdHeaderFields,
  sliceDutiesBlock,
  sliceExperienceMustBlock,
  sliceExperienceNiceBlock,
  sliceWhatWeOfferBlock,
} from "@/lib/jd/parse-jd-headers";
import {
  pickHeaderField,
  pickLongFormField,
} from "@/lib/ai/jd-extract-merge";
import { logError, toError } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/ai/extract-jd-system-prompt";
import { looksLikePdfBinary } from "@/lib/jd/extract-document-text";
import {
  generateTextWithFallback,
  getConfiguredLanguageModel,
  getJdExtractModelId,
  isLlmInferenceConfigured,
} from "@/lib/llm";

export { extractTextFromBuffer } from "@/lib/jd/extract-document-text";

// ---------------------------------------------------------------------------
// Zod schema for structured JD extraction
// ---------------------------------------------------------------------------

const jdExtractionSchema = z.object({
  position: z
    .string()
    .max(50)
    .nullable()
    .describe(
      "Exact job title from the document (e.g. line 'Position:' or heading). Null if not clearly stated. Max 50 characters.",
    ),
  department: z
    .string()
    .max(50)
    .nullable()
    .describe(
      "Department or team exactly as written (e.g. 'Solutions Team'). Free text, not a category pick.",
    ),
  employment_status: z
    .string()
    .max(50)
    .nullable()
    .describe(
      "Employment type from the document's 'Status:' line if it means Fulltime/Part-time/Contract/etc. NOT recruiting workflow.",
    ),
  document_revision: z
    .string()
    .max(50)
    .nullable()
    .describe(
      "Short value from 'Update:', revision, or document date in the header (e.g. '2026'). Null if absent.",
    ),
  work_location: z
    .string()
    .nullable()
    .describe(
      "Work location such as city name, 'Remote', 'Hybrid', or null if not mentioned",
    ),
  reporting: z
    .string()
    .nullable()
    .describe(
      "Who this role reports to (e.g. 'VP of Engineering'), or null if not mentioned",
    ),
  role_overview: z
    .string()
    .max(255)
    .nullable()
    .describe("1–2 sentence summary of the role (max 255 characters)"),
  duties_and_responsibilities: z
    .string()
    .nullable()
    .describe(
      "Full duties and responsibilities. Preserve bullet points using dashes. Null if not mentioned.",
    ),
  experience_requirements_must_have: z
    .string()
    .nullable()
    .describe(
      "Required skills and experience — the 'must have' list. Null if not mentioned.",
    ),
  experience_requirements_nice_to_have: z
    .string()
    .nullable()
    .describe(
      "Preferred or bonus skills — the 'nice to have' list. Null if not mentioned.",
    ),
  what_we_offer: z
    .string()
    .nullable()
    .describe(
      "Benefits, perks, compensation highlights, culture. Null if not mentioned.",
    ),
  language_requirements: z
    .string()
    .nullable()
    .describe(
      "Spoken/written language requirements (e.g. 'English – fluent; Japanese N3'). Null if not mentioned.",
    ),
  project_info: z
    .string()
    .nullable()
    .describe(
      "Project, product or client the person will work on. Null if not mentioned.",
    ),
  team_size: z
    .string()
    .max(100)
    .nullable()
    .describe(
      "Team size or composition exactly as written (e.g. '8 engineers'). Null if not mentioned.",
    ),
  salary_range: z
    .string()
    .max(100)
    .nullable()
    .describe(
      "Salary or compensation range exactly as written (e.g. '30-45M VND gross'). Null if not mentioned.",
    ),
});

export type ExtractedJd = Pick<
  JobDescriptionFormData,
  | "position"
  | "department"
  | "employment_status"
  | "update_note"
  | "work_location"
  | "reporting"
  | "role_overview"
  | "duties_and_responsibilities"
  | "experience_requirements_must_have"
  | "experience_requirements_nice_to_have"
  | "what_we_offer"
> &
  /** Position-management extras; the legacy JD form ignores these. */
  Partial<Record<JdExtractedExtraKey, string>>;

export type JdExtractedExtraKey =
  | "language_requirements"
  | "project_info"
  | "team_size"
  | "salary_range";

// ---------------------------------------------------------------------------
// AI extraction via Vercel AI Gateway
// ---------------------------------------------------------------------------

const EMPTY_EXTRACTED: ExtractedJd = {
  position: "",
  department: "",
  employment_status: "",
  update_note: "",
  work_location: "",
  reporting: "",
  role_overview: "",
  duties_and_responsibilities: "",
  experience_requirements_must_have: "",
  experience_requirements_nice_to_have: "",
  what_we_offer: "",
  language_requirements: "",
  project_info: "",
  team_size: "",
  salary_range: "",
};

const MAX_RAW_FALLBACK_CHARS = 20_000;

function isExtractedWhollyEmpty(e: ExtractedJd): boolean {
  return (
    !normalizeFormText(e.position) &&
    !normalizeFormText(e.department) &&
    !normalizeFormText(e.employment_status) &&
    !normalizeFormText(e.update_note) &&
    !normalizeFormText(e.work_location) &&
    !normalizeFormText(e.reporting) &&
    !normalizeFormText(e.role_overview) &&
    !normalizeFormText(e.duties_and_responsibilities) &&
    !normalizeFormText(e.experience_requirements_must_have) &&
    !normalizeFormText(e.experience_requirements_nice_to_have) &&
    !normalizeFormText(e.what_we_offer)
  );
}

/**
 * When AI + heuristics produced nothing, put the full extracted text into
 * duties (and a short preview into position / role_overview) so the API is never all-empty.
 */
function applyRawDocumentFallback(rawText: string, merged: ExtractedJd): ExtractedJd {
  const cleaned = rawText.replace(/\r\n/g, "\n").replace(/\u0000/g, "").trim();
  if (!cleaned || looksLikePdfBinary(cleaned) || !isExtractedWhollyEmpty(merged)) {
    return merged;
  }

  const lines = cleaned
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const junkLine = (l: string) =>
    /^(page\s*\d+(\s*(?:\/|of)\s*\d+)?)$/i.test(l) || /^[\d.\s\-–—]{1,12}$/.test(l);
  const firstMeaningful =
    lines.find((l) => !junkLine(l) && l.length >= 3) ?? cleaned.slice(0, 80).trim();

  return {
    ...merged,
    position: firstMeaningful.slice(0, 50),
    role_overview: cleaned.slice(0, 255),
    duties_and_responsibilities: cleaned.slice(0, MAX_RAW_FALLBACK_CHARS),
  };
}

/**
 * Merge regex/header heuristics with AI output. Label-based header parsing wins
 * over AI; long sections prefer grounded heuristic slices when AI hallucinates.
 */
export function mergeHeuristicAndAi(rawText: string, ai: ExtractedJd): ExtractedJd {
  const header = parseJdHeaderFields(rawText);
  const dutiesH = sliceDutiesBlock(rawText);
  const mustH = sliceExperienceMustBlock(rawText);
  const niceH = sliceExperienceNiceBlock(rawText);
  const offerH = sliceWhatWeOfferBlock(rawText);

  return {
    position: pickHeaderField(header.position, ai.position, rawText, 50),
    department: pickHeaderField(header.department, ai.department, rawText, 50),
    employment_status: pickHeaderField(
      header.employment_status,
      ai.employment_status,
      rawText,
      50,
    ),
    update_note: pickHeaderField(header.update_note, ai.update_note, rawText, 50),
    work_location: pickHeaderField(header.work_location, ai.work_location, rawText),
    reporting: pickHeaderField(header.reporting, ai.reporting, rawText),
    role_overview: pickHeaderField("", ai.role_overview, rawText, 255),
    duties_and_responsibilities: pickLongFormField(
      dutiesH,
      ai.duties_and_responsibilities,
      rawText,
    ),
    experience_requirements_must_have: pickLongFormField(
      mustH,
      ai.experience_requirements_must_have,
      rawText,
    ),
    experience_requirements_nice_to_have: pickLongFormField(
      niceH,
      ai.experience_requirements_nice_to_have,
      rawText,
    ),
    what_we_offer: pickLongFormField(offerH, ai.what_we_offer, rawText),
    language_requirements: ai.language_requirements ?? "",
    project_info: ai.project_info ?? "",
    team_size: ai.team_size ?? "",
    salary_range: ai.salary_range ?? "",
  };
}

/**
 * Full pipeline: deterministic header/section parse + AI (optional). Always returns
 * the best merge; never throws (AI/key failures fall back to heuristics only).
 */
export async function extractJdFromDocument(text: string): Promise<ExtractedJd> {
  const trimmed = text.trim();
  let merged: ExtractedJd;
  if (!isLlmInferenceConfigured()) {
    merged = mergeHeuristicAndAi(trimmed, EMPTY_EXTRACTED);
  } else {
    try {
      const ai = await extractJdWithAI(trimmed);
      merged = mergeHeuristicAndAi(trimmed, ai);
    } catch (error) {
      logError("JD AI extract fell back to heuristics", toError(error));
      merged = mergeHeuristicAndAi(trimmed, EMPTY_EXTRACTED);
    }
  }
  return applyRawDocumentFallback(trimmed, merged);
}

export async function extractJdWithAI(text: string): Promise<ExtractedJd> {
  const model = getConfiguredLanguageModel(getJdExtractModelId());

  // Truncate to ~12 000 chars to stay within token budget
  const truncated =
    text.length > 12_000 ? text.slice(0, 12_000) + "\n…[truncated]" : text;

  const { output } = await generateTextWithFallback({
    model,
    output: Output.object({
      name: "job_description_extraction",
      description: "Structured data extracted from a job description document",
      schema: jdExtractionSchema,
    }),
    system: SYSTEM_PROMPT,
    prompt: `Extract structured information from the following job description:\n\n${truncated}`,
    temperature: 0.1,
    maxOutputTokens: 3072,
  });

  return {
    position: normalizeFormText(output.position).slice(0, 50),
    department: normalizeFormText(output.department).slice(0, 50),
    employment_status: normalizeFormText(output.employment_status).slice(0, 50),
    update_note: normalizeFormText(output.document_revision).slice(0, 50),
    work_location: normalizeFormText(output.work_location),
    reporting: normalizeFormText(output.reporting),
    role_overview: normalizeFormText(output.role_overview).slice(0, 255),
    duties_and_responsibilities: normalizeFormText(
      output.duties_and_responsibilities,
    ),
    experience_requirements_must_have: normalizeFormText(
      output.experience_requirements_must_have,
    ),
    experience_requirements_nice_to_have: normalizeFormText(
      output.experience_requirements_nice_to_have,
    ),
    what_we_offer: normalizeFormText(output.what_we_offer),
    language_requirements: normalizeFormText(output.language_requirements),
    project_info: normalizeFormText(output.project_info),
    team_size: normalizeFormText(output.team_size).slice(0, 100),
    salary_range: normalizeFormText(output.salary_range).slice(0, 100),
  };
}
