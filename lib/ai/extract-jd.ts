import "@/lib/ai/pdf-node-polyfill";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { generateText, Output } from "ai";
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
import { SYSTEM_PROMPT } from "@/lib/ai/extract-jd-system-prompt";
import {
  getVercelGatewayLanguageModel,
  isLlmInferenceConfigured,
} from "@/lib/llm";

// ---------------------------------------------------------------------------
// Text extraction from file buffer
// ---------------------------------------------------------------------------

export async function extractTextFromBuffer(
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  if (mimeType === "application/pdf") {
    try {
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        return result.text.trim();
      } finally {
        await parser.destroy();
      }
    } catch {
      // fall through
    }
  }

  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  }

  // Plain text or unknown
  return buffer.toString("utf-8").trim();
}

// ---------------------------------------------------------------------------
// Zod schema for structured JD extraction
// ---------------------------------------------------------------------------

const jdExtractionSchema = z.object({
  position: z
    .string()
    .max(50)
    .describe(
      "Job title from the document (e.g. line 'Position:' or job title heading). Max 50 characters.",
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
>;

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
  if (!cleaned || !isExtractedWhollyEmpty(merged)) return merged;

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

function pickFilled(ai: string, heuristic: string, maxLen?: number): string {
  const a = normalizeFormText(ai);
  const h = normalizeFormText(heuristic);
  const v = a || h;
  return maxLen != null ? v.slice(0, maxLen) : v;
}

/**
 * Merge regex/header heuristics with AI output. Heuristics fix PDF “one-line header”
 * blobs where the model often returns empty optional fields.
 */
export function mergeHeuristicAndAi(rawText: string, ai: ExtractedJd): ExtractedJd {
  const header = parseJdHeaderFields(rawText);
  return {
    position: pickFilled(ai.position, header.position, 50),
    department: pickFilled(ai.department, header.department, 50),
    employment_status: pickFilled(
      ai.employment_status,
      header.employment_status,
      50,
    ),
    update_note: pickFilled(ai.update_note, header.update_note, 50),
    work_location: pickFilled(ai.work_location, header.work_location),
    reporting: pickFilled(ai.reporting, header.reporting),
    role_overview: pickFilled(ai.role_overview, "", 255),
    duties_and_responsibilities: pickFilled(
      ai.duties_and_responsibilities,
      sliceDutiesBlock(rawText),
    ),
    experience_requirements_must_have: pickFilled(
      ai.experience_requirements_must_have,
      sliceExperienceMustBlock(rawText),
    ),
    experience_requirements_nice_to_have: pickFilled(
      ai.experience_requirements_nice_to_have,
      sliceExperienceNiceBlock(rawText),
    ),
    what_we_offer: pickFilled(ai.what_we_offer, sliceWhatWeOfferBlock(rawText)),
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
    } catch {
      merged = mergeHeuristicAndAi(trimmed, EMPTY_EXTRACTED);
    }
  }
  return applyRawDocumentFallback(trimmed, merged);
}

export async function extractJdWithAI(text: string): Promise<ExtractedJd> {
  const model = getVercelGatewayLanguageModel();

  // Truncate to ~12 000 chars to stay within token budget
  const truncated =
    text.length > 12_000 ? text.slice(0, 12_000) + "\n…[truncated]" : text;

  const { output } = await generateText({
    model,
    output: Output.object({
      name: "job_description_extraction",
      description: "Structured data extracted from a job description document",
      schema: jdExtractionSchema,
    }),
    system: SYSTEM_PROMPT,
    prompt: `Extract structured information from the following job description:\n\n${truncated}`,
    temperature: 0.1,
    maxOutputTokens: 2048,
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
  };
}
