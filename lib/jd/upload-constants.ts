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
