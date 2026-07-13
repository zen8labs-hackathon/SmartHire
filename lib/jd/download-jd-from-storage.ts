import { resolveMimeType } from "@/lib/jd/detect-buffer-mime";
import { downloadObject } from "@/lib/storage/s3";

/** Infer MIME type from storage object path extension. */
export function mimeTypeFromStoragePath(storagePath: string): string {
  const ext = storagePath.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "application/pdf";
  if (ext === "docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return "text/plain";
}

export async function downloadJdFromStorage(
  storagePath: string,
): Promise<{ buffer: Buffer; mimeType: string } | { error: string }> {
  const mimeTypeHint = mimeTypeFromStoragePath(storagePath);
  try {
    const buffer = await downloadObject(storagePath);
    const mimeType = resolveMimeType(buffer, mimeTypeHint);
    return { buffer, mimeType };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to download JD file." };
  }
}
