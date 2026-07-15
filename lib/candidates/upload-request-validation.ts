import { isCandidateSource, type CandidateSource } from "@/lib/candidates/source-constants";
import { extensionFromFilename, isAllowedCvFilename } from "@/lib/candidates/upload-constants";
import type { QueryExecutor } from "@/lib/db/config/client";
import { getJobById } from "@/lib/db/jobs";

const MAX_SOURCE_OTHER_LEN = 500;
const MAX_EXPECTED_SALARY_LEN = 200;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CvUploadRequestBody = {
  jobId?: string | null;
  filename?: string;
  mimeType?: string | null;
  source?: string;
  sourceOther?: string | null;
  expectedSalary?: string | null;
};

export type ValidatedUploadFields = {
  filename: string;
  ext: string;
  baseName: string;
  jobId: string;
  source: CandidateSource;
  sourceOther: string | null;
  expectedSalary: string | null;
  mimeType: string | null;
};

export type UploadValidationResult =
  | { ok: true; value: ValidatedUploadFields }
  | { ok: false; error: string; status: number };

/**
 * Filename/jobId/source/sourceOther/expectedSalary validation for
 * `temp-upload/confirm`, the only entry point that creates
 * `candidates`/`campaign_applied`/`cv_detail_versions` rows for a CV upload.
 */
export async function validateCvUploadRequest(
  db: QueryExecutor,
  body: CvUploadRequestBody,
): Promise<UploadValidationResult> {
  const filename = typeof body.filename === "string" ? body.filename.trim() : "";
  if (!filename || !isAllowedCvFilename(filename)) {
    return { ok: false, error: "Only .pdf and .docx files are allowed.", status: 400 };
  }

  const ext = extensionFromFilename(filename)!;
  const baseName = filename.slice(0, filename.length - ext.length);
  const jobId =
    typeof body.jobId === "string" && body.jobId.length > 0 ? body.jobId : null;

  if (!jobId) {
    return { ok: false, error: "Select a target campaign before uploading.", status: 400 };
  }
  if (!UUID_RE.test(jobId)) {
    return { ok: false, error: "Invalid job id.", status: 400 };
  }

  const sourceRaw = typeof body.source === "string" ? body.source.trim() : "";
  if (!sourceRaw || !isCandidateSource(sourceRaw)) {
    return { ok: false, error: "Select a valid candidate source.", status: 400 };
  }

  let sourceOther: string | null = null;
  if (sourceRaw === "Other") {
    const detail = typeof body.sourceOther === "string" ? body.sourceOther.trim() : "";
    if (!detail) {
      return {
        ok: false,
        error: "Please describe the source when you select Other.",
        status: 400,
      };
    }
    if (detail.length > MAX_SOURCE_OTHER_LEN) {
      return {
        ok: false,
        error: `Source description must be at most ${MAX_SOURCE_OTHER_LEN} characters.`,
        status: 400,
      };
    }
    sourceOther = detail;
  }

  let expectedSalary: string | null = null;
  if (typeof body.expectedSalary === "string") {
    const trimmed = body.expectedSalary.trim();
    if (trimmed.length > MAX_EXPECTED_SALARY_LEN) {
      return {
        ok: false,
        error: `Expected salary must be at most ${MAX_EXPECTED_SALARY_LEN} characters.`,
        status: 400,
      };
    }
    expectedSalary = trimmed || null;
  }

  const job = await getJobById(db, jobId);
  if (!job) {
    return { ok: false, error: "Job not found.", status: 400 };
  }

  const mimeType = typeof body.mimeType === "string" ? body.mimeType : null;

  return {
    ok: true,
    value: { filename, ext, baseName, jobId, source: sourceRaw, sourceOther, expectedSalary, mimeType },
  };
}
