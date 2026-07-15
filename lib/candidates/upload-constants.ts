export const CV_BUCKET = "candidate-cvs";

/** Final storage prefix: `cv/{candidateId}/{applicationId}/{filename}`. */
export const CV_KEY_PREFIX = "cv/";

/** Temp holding prefix for uploads awaiting basic-info confirmation (CV9X7R). No candidate/application id exists yet, so temp keys are self-contained. */
export const CV_TEMP_KEY_PREFIX = "cv-temp/";

export const MAX_CV_BYTES = 25 * 1024 * 1024;

export const ALLOWED_CV_EXTENSIONS = [".pdf", ".docx"] as const;

export function extensionFromFilename(filename: string): string | null {
  const i = filename.lastIndexOf(".");
  if (i < 0) return null;
  return filename.slice(i).toLowerCase();
}

export function isAllowedCvFilename(filename: string): boolean {
  const ext = extensionFromFilename(filename);
  return ext != null && (ALLOWED_CV_EXTENSIONS as readonly string[]).includes(ext);
}
