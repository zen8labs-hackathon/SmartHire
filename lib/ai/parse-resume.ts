import { Output } from "ai";
import { z } from "zod";

import {
  generateTextWithFallback,
  getConfiguredLanguageModel,
  isLlmInferenceConfigured,
} from "@/lib/llm";

/**
 * Field names/shape match `lib/candidates/normalize-parsed-resume.ts`'s
 * `NormalizedParsedResume` exactly (that's what `parsed_payload` stores), plus
 * `dateOfBirth`/`studentYears`, which are separate `cv_detail_versions`
 * columns rather than part of the JSON payload.
 */
const parsedResumeSchema = z.object({
  name: z.string().nullable().describe("Candidate's full name."),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  role: z
    .string()
    .nullable()
    .describe("Current or most recent job title / target role."),
  experienceYears: z
    .number()
    .nullable()
    .describe("Total years of professional experience, if inferable from dates or summary."),
  skills: z.array(z.string()).describe("Concise individual skill tokens, not sentences."),
  degree: z.string().nullable().describe("Degree level, e.g. Bachelor's, Master's."),
  school: z.string().nullable(),
  experienceSummary: z.string().nullable().describe("Short summary of work experience."),
  englishLevel: z.string().nullable().describe("e.g. IELTS 7.5, Fluent, B2."),
  gpa: z.string().nullable().describe("Grade point if clearly stated, e.g. 3.7/4.0."),
  dateOfBirth: z
    .string()
    .nullable()
    .describe("ISO date YYYY-MM-DD if explicitly stated in the document, else null."),
  studentYears: z
    .string()
    .nullable()
    .describe(
      "Academic year / graduation status if the candidate is a student, e.g. 'Year 3', 'Final year', 'Graduated 2024'.",
    ),
});

export type ParsedResume = z.infer<typeof parsedResumeSchema>;

const SYSTEM_PROMPT = `You extract structured candidate data from resume text. Use null for any field that is not clearly stated in the document -- never guess or fabricate values.`;

const MAX_INPUT_CHARS = 120_000;

/**
 * Without a timeout, a slow/hung LLM call leaves the caller's single
 * synchronous `/process` request (and the upload queue row's "Scanning"
 * status in `add-candidate-modal.tsx`) waiting indefinitely -- there's no
 * other client- or server-side timeout anywhere in this call chain (S3
 * download, `extractTextFromBuffer`, this call, the dedupe check, the DB
 * write all run in series inside one awaited request). 60s is generous for
 * a single resume-extraction call under normal provider latency.
 */
const AI_CALL_TIMEOUT_MS = 60_000;

/**
 * Replaces the old `process-cv` Edge Function's raw `fetch` + manual
 * `json_object`/plain-text fallback dance with the same
 * `generateText`/`Output.object` pattern already used by JD extraction and
 * evaluation fill (`lib/ai/extract-jd.ts`, `lib/ai/fill-candidate-evaluation.ts`)
 * -- works uniformly across the configured provider (Vercel AI Gateway or
 * Gemini) instead of hardcoding the AI Gateway chat-completions endpoint.
 */
export async function parseResumeWithAI(plainText: string): Promise<ParsedResume> {
  if (!isLlmInferenceConfigured()) {
    throw new Error(
      "AI resume extraction is not configured (missing LLM credentials).",
    );
  }

  const model = getConfiguredLanguageModel();
  const truncated =
    plainText.length > MAX_INPUT_CHARS
      ? plainText.slice(0, MAX_INPUT_CHARS)
      : plainText;

  let output: ParsedResume;
  try {
    ({ output } = await generateTextWithFallback({
      model,
      output: Output.object({
        name: "parsed_resume",
        description: "Structured candidate data extracted from a resume document",
        schema: parsedResumeSchema,
      }),
      system: SYSTEM_PROMPT,
      prompt: `Resume text:\n\n${truncated}`,
      temperature: 0.1,
      maxOutputTokens: 2048,
      abortSignal: AbortSignal.timeout(AI_CALL_TIMEOUT_MS),
    }));
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") {
      throw new Error(
        "AI resume extraction timed out. The AI provider may be slow or unreachable -- try again in a moment.",
      );
    }
    throw e;
  }

  return output;
}
