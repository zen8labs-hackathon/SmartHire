export const MAX_CANDIDATE_EVAL_TEMPLATE_BYTES = 10 * 1024 * 1024;

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
