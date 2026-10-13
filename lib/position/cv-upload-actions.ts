import type { QueryExecutor } from "@/lib/db/config/client";
import {
  FILE_UPLOAD_ERROR_STAGE,
  FILE_UPLOAD_STATUS,
  getFileUploadsByIds,
  updateFileUploadById,
  type FileUploadRow,
} from "@/lib/db/upload-history";
import { MAX_BATCH_FILES } from "@/lib/candidates/upload-constants";
import { fileUploadQueue } from "@/lib/queue/file-upload.queue";
import { logApiError } from "@/lib/logger";

export type RetryResult =
  | { id: string; ok: true }
  | { id: string; ok: false; error: string };

/** Rows that exist and belong to `jobId` (null = talent pool). */
export async function loadScopedUploads(
  db: QueryExecutor,
  ids: string[],
  jobId: string | null,
): Promise<FileUploadRow[]> {
  const rows = await getFileUploadsByIds(db, ids);
  return rows.filter((r) => (r.job_id ?? null) === jobId);
}

export async function retryScopedUploads(
  db: QueryExecutor,
  ids: string[],
  jobId: string | null,
): Promise<{ ok: true; results: RetryResult[] } | { ok: false; error: string }> {
  const clean = [...new Set(ids.filter((x) => /^\d+$/.test(String(x))).map(String))];
  if (clean.length === 0) return { ok: false, error: "No files provided." };
  if (clean.length > MAX_BATCH_FILES) {
    return { ok: false, error: `Retry is limited to ${MAX_BATCH_FILES} files at a time.` };
  }
  const rows = await loadScopedUploads(db, clean, jobId);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const results: RetryResult[] = [];
  for (const id of clean) {
    const upload = byId.get(id);
    if (!upload) {
      results.push({ id, ok: false, error: "Upload not found." });
      continue;
    }
    if (upload.status === FILE_UPLOAD_STATUS.Processing) {
      results.push({ id, ok: false, error: "Already processing." });
      continue;
    }
    try {
      await fileUploadQueue.add(
        upload.job_id ? "upload-cv" : "upload-candidate",
        { fileUploadId: id },
        { deduplication: { id: `cv-${id}-${upload.job_id || "candidate"}` }, priority: 2 },
      );
    } catch (err) {
      logApiError("Position CV retry: enqueue failed", err, { id });
      await updateFileUploadById(db, id, {
        status: FILE_UPLOAD_STATUS.Failed,
        errorCode: 500,
        errorStage: FILE_UPLOAD_ERROR_STAGE.Queue,
        errorMessage: "Failed to enqueue file for processing.",
      });
      results.push({ id, ok: false, error: "Failed to enqueue file for processing." });
      continue;
    }
    await updateFileUploadById(db, id, {
      status: FILE_UPLOAD_STATUS.Pending,
      errorCode: null,
      errorStage: null,
      errorMessage: null,
    });
    results.push({ id, ok: true });
  }
  return { ok: true, results };
}
