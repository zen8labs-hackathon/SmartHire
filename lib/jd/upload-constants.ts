import { buildTimestampedStorageFilename } from "@/lib/storage/storage-key";

export const JD_BUCKET = "job-descriptions";

export const MAX_JD_BYTES = 10 * 1024 * 1024;

export const ALLOWED_JD_EXTENSIONS = [".pdf", ".docx", ".txt"] as const;

export function extensionFromFilename(filename: string): string | null {
  const i = filename.lastIndexOf(".");
  if (i < 0) return null;
  return filename.slice(i).toLowerCase();
}

export function isAllowedJdFilename(filename: string): boolean {
  const ext = extensionFromFilename(filename);
  return ext != null && (ALLOWED_JD_EXTENSIONS as readonly string[]).includes(ext);
}

/**
 * A JD file is uploaded straight to S3 before a job id exists (see
 * `/api/admin/job-openings/sign-upload`), so it lands at a temp key under this
 * prefix. It becomes the job's real file once a create/edit is confirmed --
 * {@link buildFinalJdStoragePath} + `moveObject` move it under
 * {@link JD_FINAL_KEY_PREFIX} -- or is deleted outright if the user cancels.
 */
export const JD_TEMP_KEY_PREFIX = "jd/";

/** Final key prefix once a job's id is known: `job_descriptions/{jobId}/{filename}`. */
export const JD_FINAL_KEY_PREFIX = "job_descriptions/";

export function isJdTempKey(key: string): boolean {
  return key.startsWith(JD_TEMP_KEY_PREFIX) && !key.includes("..");
}

/**
 * Storage key a temp-uploaded JD file gets moved to once a job id is known:
 * `job_descriptions/{jobId}/{ddMMyyyyHHmmss}_{sanitized-label}{ext}`.
 */
export function buildFinalJdStoragePath(
  jobId: string,
  tempStoragePath: string,
  originalFilename?: string | null,
): string {
  const ext =
    extensionFromFilename(originalFilename ?? "") ??
    extensionFromFilename(tempStoragePath) ??
    ".pdf";
  const baseName = originalFilename
    ? originalFilename.slice(0, originalFilename.length - ext.length)
    : "jd";
  return `${JD_FINAL_KEY_PREFIX}${jobId}/${buildTimestampedStorageFilename(baseName, ext)}`;
}
