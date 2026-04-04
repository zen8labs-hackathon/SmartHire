import { JD_BUCKET } from "@/lib/jd/upload-constants";
import type { SupabaseClient } from "@supabase/supabase-js";

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
  admin: SupabaseClient,
  storagePath: string,
): Promise<{ buffer: Buffer; mimeType: string } | { error: string }> {
  const mimeType = mimeTypeFromStoragePath(storagePath);
  const { data, error } = await admin.storage.from(JD_BUCKET).download(storagePath);
  if (error || !data) {
    return { error: error?.message ?? "Failed to download JD file." };
  }
  const buffer = Buffer.from(await data.arrayBuffer());
  return { buffer, mimeType };
}
