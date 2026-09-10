import { buildStorageFilename } from "@/lib/storage/storage-key";

export const MAX_CANDIDATE_EVAL_TEMPLATE_BYTES = 10 * 1024 * 1024;

export const MAX_CANDIDATE_EVAL_TEMPLATE_TEXT_LEN = 20_000;

export const MAX_EVAL_TEMPLATE_TITLE_LEN = 120;

/** S3 key prefix -- kept distinct from `jd/` so the two never collide. */
export const CANDIDATE_EVAL_TEMPLATE_KEY_PREFIX = "evaluation-template/";

export function isAllowedCandidateEvalTemplateFilename(filename: string): boolean {
  const i = filename.lastIndexOf(".");
  if (i < 0) return false;
  return filename.slice(i).toLowerCase() === ".pdf";
}

/**
 * `evaluation-template/{jobId}/{sanitized-original-name}_{shortId}.pdf` --
 * one template per job (DB7X2K item 8 replaced the old system-wide
 * singleton with `job_evaluate_templates`, one row per job). Validated
 * against the specific job the request is scoped to, not just the general
 * shape, so a caller can't commit/delete a path that belongs to a different
 * job.
 *
 * A library entry's file (see below) reuses this same validator with
 * `library/{templateId}` passed as `jobId` -- the pattern (any scope segment,
 * then a filename) doesn't actually care which kind of id it is.
 */
export function isValidCandidateEvalTemplateStoragePath(
  path: string,
  jobId: string,
): boolean {
  const escapedJobId = jobId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `^evaluation-template/${escapedJobId}/[\\w.-]+_[0-9a-f]{8}\\.pdf$`,
    "i",
  );
  return re.test(path);
}

/**
 * A library template's own id doesn't exist until its row is INSERTed, so its
 * file is uploaded to a temp key up front (mirrors the JD file flow --
 * `lib/jd/upload-constants.ts`'s `JD_TEMP_KEY_PREFIX`) and moved into place
 * under `evaluation-template/library/{templateId}/` once the row (and its id)
 * exists -- see `POST /api/admin/evaluation-templates`.
 */
export const CANDIDATE_EVAL_TEMPLATE_TEMP_KEY_PREFIX = "evaluation-template/tmp/";

export function isCandidateEvalTemplateTempKey(key: string): boolean {
  return (
    key.startsWith(CANDIDATE_EVAL_TEMPLATE_TEMP_KEY_PREFIX) && !key.includes("..")
  );
}

/** Final key for a library template's file: `evaluation-template/library/{templateId}/{name}_{shortId}.pdf`. */
export function buildLibraryEvalTemplateStoragePath(
  templateId: string,
  originalFilename?: string | null,
): string {
  const baseName =
    originalFilename && isAllowedCandidateEvalTemplateFilename(originalFilename)
      ? originalFilename.slice(0, originalFilename.length - ".pdf".length)
      : "evaluation-template";
  return `${CANDIDATE_EVAL_TEMPLATE_KEY_PREFIX}library/${templateId}/${buildStorageFilename(baseName, ".pdf")}`;
}
