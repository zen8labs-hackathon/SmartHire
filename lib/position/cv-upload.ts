import {
  CV_FOLDER_PREFIX,
  MAX_BATCH_FILES,
  MAX_CV_BYTES,
  extensionFromFilename,
  isAllowedCvFilename,
  mimeTypeFromCvFilename,
} from "@/lib/candidates/upload-constants";
import { isCandidateSource } from "@/lib/candidates/source-constants";
import type { CampaignAppliedSource } from "@/lib/db/campaign-applied";

/** Path segment used instead of a job uuid for uploads into the talent pool. */
export const POOL_ID = "pool";

export type CvUploadFileInput = {
  fileName?: unknown;
  mimeType?: unknown;
  size?: unknown;
};

export type CvUploadBody = {
  files?: CvUploadFileInput[];
  source?: unknown;
  /** Optional recruiter label; falls back to the session user in the route. */
  recruiter?: unknown;
};

export type ValidCvUploadFile = {
  fileName: string;
  storageKey: string;
  mimeType: string | null;
};

export type CvUploadValidation =
  | { ok: true; files: ValidCvUploadFile[]; source: string; recruiter: string | null }
  | { ok: false; error: string };

/**
 * Validates an upload-init body. `source` is the free-form label picked in the
 * dialog (stored on `file_uploads.file_source`); `recruiter` is an optional label
 * (defaults to the session user in the route).
 */
export function validateCvUploadBody(
  body: CvUploadBody,
  makeKey: () => string = () => crypto.randomUUID(),
): CvUploadValidation {
  const files = Array.isArray(body.files) ? body.files : [];
  if (files.length === 0) return { ok: false, error: "No files provided." };
  if (files.length > MAX_BATCH_FILES) {
    return {
      ok: false,
      error: `A batch is limited to ${MAX_BATCH_FILES} files.`,
    };
  }
  const source = typeof body.source === "string" ? body.source.trim() : "";
  if (!source) return { ok: false, error: "CV source is required." };

  const out: ValidCvUploadFile[] = [];
  for (const file of files) {
    const fileName =
      typeof file.fileName === "string" ? file.fileName.trim() : "";
    if (!fileName || !isAllowedCvFilename(fileName)) {
      return {
        ok: false,
        error: `Only .pdf and .docx files are allowed: ${fileName || "(unnamed)"}`,
      };
    }
    if (typeof file.size === "number" && file.size > MAX_CV_BYTES) {
      return {
        ok: false,
        error: `${fileName} exceeds the ${MAX_CV_BYTES / 1024 / 1024} MB limit.`,
      };
    }
    const ext = extensionFromFilename(fileName)!;
    out.push({
      fileName,
      storageKey: `${CV_FOLDER_PREFIX}${makeKey()}${ext}`,
      // Canonical type from the extension; browsers often report "" for .docx.
      mimeType: mimeTypeFromCvFilename(fileName),
    });
  }
  const rec = typeof body.recruiter === "string" ? body.recruiter.trim().slice(0, 120) : "";
  return { ok: true, files: out, source, recruiter: rec || null };
}

/** Maps a `file_uploads.file_source` label onto `campaign_applied.source` / `source_other`. */
export function sourceFromFileSource(fileSource: string | null | undefined): {
  source: CampaignAppliedSource;
  sourceOther: string | null;
} {
  const label = fileSource?.trim() ?? "";
  if (label && isCandidateSource(label) && label !== "Other") {
    return { source: label, sourceOther: null };
  }
  return {
    source: "Other",
    sourceOther: label && label !== "Other" ? label : null,
  };
}
