export const CV_BUCKET = "candidate-cvs";

/** Final storage prefix: `candidates/{candidateId}/{filename}`. */
export const CV_KEY_PREFIX = "candidates/";

//cv/filename.pdf
export const CV_FOLDER_PREFIX = "cv/";

/** Temp holding prefix for uploads awaiting basic-info confirmation (CV9X7R). No candidate/application id exists yet, so temp keys are self-contained. */
export const CV_TEMP_KEY_PREFIX = "cv-temp/";

export const MAX_CV_BYTES = 25 * 1024 * 1024;

/** Upper bound on files signed/retried in one request -- shared by the
 * sign-urls and retry routes (and the client service that calls them) so it
 * stays a client-safe constant instead of being pulled in from a route
 * module (which would drag server-only deps into the client bundle). */
export const MAX_BATCH_FILES = 100;

export const ALLOWED_CV_EXTENSIONS = [".pdf", ".docx"] as const;

export function extensionFromFilename(filename: string): string | null {
  const i = filename.lastIndexOf(".");
  if (i < 0) return null;
  return filename.slice(i).toLowerCase();
}

export function isAllowedCvFilename(filename: string): boolean {
  const ext = extensionFromFilename(filename);
  return (
    ext != null && (ALLOWED_CV_EXTENSIONS as readonly string[]).includes(ext)
  );
}
