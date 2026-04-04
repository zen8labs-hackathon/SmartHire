export const CANDIDATE_EVAL_TEMPLATE_BUCKET = "candidate-evaluation-template";

export const MAX_CANDIDATE_EVAL_TEMPLATE_BYTES = 10 * 1024 * 1024;

export function isAllowedCandidateEvalTemplateFilename(filename: string): boolean {
  const i = filename.lastIndexOf(".");
  if (i < 0) return false;
  return filename.slice(i).toLowerCase() === ".pdf";
}

const COMMITTED_PATH =
  /^singleton\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/i;

export function isValidCandidateEvalTemplateStoragePath(path: string): boolean {
  return COMMITTED_PATH.test(path);
}
