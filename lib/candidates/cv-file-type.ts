export type CvFileInfo = {
  fileName: string | null;
  mimeType: string | null;
};

const MAX_EXTENSION_LENGTH = 5;

/**
 * Short type label for a CV file tag ("PDF", "DOCX", ...). The mime type wins
 * (the stored `mime_type` is sniffed from the file's bytes at upload, while a
 * file name can lie); the file-name extension covers a missing/generic mime;
 * "FILE" is the last resort.
 */
export function cvFileTypeLabel({ fileName, mimeType }: CvFileInfo): string {
  const mime = (mimeType ?? "").toLowerCase();
  if (mime.includes("pdf")) return "PDF";
  if (mime.includes("wordprocessingml")) return "DOCX";
  if (mime.includes("msword")) return "DOC";

  const dot = fileName?.lastIndexOf(".") ?? -1;
  if (fileName && dot > 0 && dot < fileName.length - 1) {
    const ext = fileName.slice(dot + 1).trim();
    if (ext && ext.length <= MAX_EXTENSION_LENGTH && /^[a-z0-9]+$/i.test(ext)) {
      return ext.toUpperCase();
    }
  }
  return "FILE";
}
