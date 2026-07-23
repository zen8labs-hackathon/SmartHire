import { Output } from "ai";
import { z } from "zod";

import { experienceYearsFromWorkStart } from "@/lib/ai/experience-years-from-work-start";
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
 *
 * `earliestWorkStart` is AI-only scaffolding: used to derive `experienceYears`
 * when the CV never states an explicit year count, then stripped before return
 * so `parsed_payload` stays on the NormalizedParsedResume shape.
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
    .describe(
      "Total years of professional experience only when the resume explicitly states a number (e.g. '5 years'). Otherwise null -- do not estimate here.",
    ),
  earliestWorkStart: z
    .string()
    .nullable()
    .describe(
      "Earliest professional Work Experience start date as YYYY, YYYY-MM, or YYYY-MM-DD. Use the first paid/professional role start (not education or unpaid internships unless that is the only work history). Null if no dated work history exists.",
    ),
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

export type ParsedResume = Omit<
  z.infer<typeof parsedResumeSchema>,
  "earliestWorkStart"
>;

const SYSTEM_PROMPT = `You extract structured candidate data from resume text. Use null for any field that is not clearly stated in the document -- never guess or fabricate values. For earliestWorkStart, copy the earliest dated professional work-experience start from the Work Experience section when present; do not invent dates.`;

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

  let output: z.infer<typeof parsedResumeSchema>;
  try {
    ({ output } = await generateTextWithFallback(
      {
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
      },
      // The primary signal is already aborted when a timeout triggers the
      // fallback. Give the fallback provider its own full timeout window.
      () => AbortSignal.timeout(AI_CALL_TIMEOUT_MS),
    ));
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") {
      throw new Error(
        "AI resume extraction timed out. The AI provider may be slow or unreachable -- try again in a moment.",
      );
    }
    throw e;
  }

  const { earliestWorkStart, experienceYears: explicitYears, ...rest } =
    output;
  // Prefer an explicit "N years" statement; otherwise derive from the earliest
  // Work Experience start date through today.
  const experienceYears =
    explicitYears != null && Number.isFinite(explicitYears)
      ? explicitYears
      : experienceYearsFromWorkStart(earliestWorkStart);

  return { ...rest, experienceYears };
}
