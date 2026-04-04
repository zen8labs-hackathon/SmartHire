export const CV_BUCKET = "candidate-cvs";

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
