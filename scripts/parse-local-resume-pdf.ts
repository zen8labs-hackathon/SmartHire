/**
 * Local helper: extract + AI-parse a resume PDF/DOCX on disk (no DB / S3).
 *
 * Usage:
 *   npm run parse:resume -- /absolute/or/relative/path/to/cv.pdf
 *
 * Requires the same LLM env vars as the app (see `.env` / `LLM_PROVIDER`).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  parseResumeWithAIDetailed,
  type ParsedResume,
  type ResumeExperienceMeta,
} from "@/lib/ai/parse-resume";
import { extractTextFromBuffer } from "@/lib/jd/extract-document-text";

export type LocalResumeParseResult = {
  filePath: string;
  mimeType: string;
  textLength: number;
  textPreview: string;
  experienceMeta: ResumeExperienceMeta;
  parsed: ParsedResume;
};

function mimeFromExt(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (ext === ".txt" || ext === ".md") return "text/plain";
  return "application/octet-stream";
}

/**
 * Read a local CV file, extract text, run the same AI parse path as upload
 * processing, and return the structured result (including how experience
 * years were resolved).
 */
export async function parseLocalResumePdf(
  filePath: string,
): Promise<LocalResumeParseResult> {
  const absolutePath = path.resolve(filePath);
  const buffer = await readFile(absolutePath);
  const mimeType = mimeFromExt(absolutePath);
  const plainText = await extractTextFromBuffer(buffer, mimeType);

  if (!plainText || plainText.length < 20) {
    throw new Error("Could not extract enough text from the document.");
  }

  const { parsed, experienceMeta } = await parseResumeWithAIDetailed(plainText);

  return {
    filePath: absolutePath,
    mimeType,
    textLength: plainText.length,
    textPreview: plainText.slice(0, 400),
    experienceMeta,
    parsed,
  };
}

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error(
      "Usage: npm run parse:resume -- /path/to/cv.pdf\n" +
        "       npx tsx --env-file=.env scripts/parse-local-resume-pdf.ts /path/to/cv.pdf",
    );
    process.exit(1);
  }

  const result = await parseLocalResumePdf(filePath);
  console.log(
    JSON.stringify(
      {
        filePath: result.filePath,
        mimeType: result.mimeType,
        textLength: result.textLength,
        experienceMeta: result.experienceMeta,
        experienceYears: result.parsed.experienceYears,
        parsed: result.parsed,
        textPreview: result.textPreview,
      },
      null,
      2,
    ),
  );
}

const isCliEntry =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isCliEntry) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
