export const MAX_CANDIDATE_EVAL_TEMPLATE_BYTES = 10 * 1024 * 1024;

/** S3 key prefix -- kept distinct from `jd/` so the two never collide. */
export const CANDIDATE_EVAL_TEMPLATE_KEY_PREFIX = "evaluation-template/";

export function isAllowedCandidateEvalTemplateFilename(filename: string): boolean {
  const i = filename.lastIndexOf(".");
  if (i < 0) return false;
  return filename.slice(i).toLowerCase() === ".pdf";
}

/**
 * `evaluation-template/{jobId}/{fileId}.pdf` -- one template per job
 * (DB7X2K item 8 replaced the old system-wide singleton with
 * `job_evaluate_templates`, one row per job). Validated against the
 * specific job the request is scoped to, not just the general shape, so a
 * caller can't commit/delete a path that belongs to a different job.
 */
export function isValidCandidateEvalTemplateStoragePath(
  path: string,
  jobId: string,
): boolean {
  const escapedJobId = jobId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `^evaluation-template/${escapedJobId}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.pdf$`,
    "i",
  );
  return re.test(path);
}
