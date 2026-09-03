import type { UploadedFile } from "@/app/api/admin/upload-files/history/[jobId]/route";
import type { FileResult } from "@/app/api/admin/upload-files/sign-urls/route";
import type { RetryResult } from "@/app/api/admin/upload-files/retry/route";
import type { CandidateApplicationSummary } from "@/app/api/admin/upload-files/[id]/candidate-applications/route";
import { MAX_BATCH_FILES } from "@/lib/candidates/upload-constants";
import {
  FILE_UPLOAD_ERROR_STAGE,
  FILE_UPLOAD_STATUS,
  type FileUploadErrorStage,
  type FileUploadProgressRow,
  type FileUploadRow,
  type FileUploadStatus,
} from "@/lib/db/upload-history";
import dayjs from "dayjs";

/*
Client-side only service for interacting with the upload-files API endpoints
 */

export const uploadCvService = {
  // PATCH /upload-files/[id]/change-status -- flip one row's status/error fields
  changeUploadStatus: async (
    id: string,
    status?: FileUploadStatus,
    errorCode?: number | null,
    errorMessage?: string | null,
    errorStage?: FileUploadErrorStage | null,
  ): Promise<FileUploadRow> => {
    const res = await fetch(`/api/admin/upload-files/${id}/change-status`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        errorCode,
        errorMessage,
        errorStage,
      }),
    });
    const json = (await res.json()) as {
      error?: string;
      file?: FileUploadRow;
    };
    if (!res.ok || !json.file) {
      throw new Error(json.error ?? "Could not update upload status.");
    }
    return json.file;
  },

  // POST /upload-files/history[/jobId] -- register a batch's file_uploads rows.
  // `recruiter` is an optional manual label for the whole batch; when omitted
  // the server falls back to the caller's username. `uploaded_by` is always set
  // server-side from the auth'd user.
  createUploadHistory: async (
    jobId: string | null,
    files: UploadedFile[],
    recruiter?: string | null,
  ): Promise<{ batchId: string; files: FileUploadRow[] }> => {
    const url = jobId
      ? `/api/admin/upload-files/history/${jobId}`
      : `/api/admin/upload-files/history`;
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recruiter: recruiter ?? null,
        files: files.map((f) => ({
          fileName: f.fileName,
          mimeType: f.mimeType ?? null,
          size: f.size,
          fileSource: f.fileSource ?? null,
        })),
      }),
    });
    const json = (await res.json()) as {
      error?: string;
      batchId?: string;
      files?: FileUploadRow[];
    };
    if (!res.ok || !json.batchId || !json.files) {
      throw new Error(json.error ?? "Could not record upload batch.");
    }
    return { batchId: json.batchId, files: json.files };
  },

  // GET /upload-files/history[/jobId] -- paginated, filterable upload-history
  getUploadList: async (
    jobId: string | null,
    filters?: {
      status?: FileUploadStatus;
      batchId?: string;
      fileName?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<{
    rows: FileUploadRow[];
    total: number;
    limit: number;
    offset: number;
  }> => {
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    if (filters?.batchId) params.set("batchId", filters.batchId);
    if (filters?.fileName) params.set("fileName", filters.fileName);
    if (filters?.limit != null) params.set("limit", String(filters.limit));
    if (filters?.offset != null) params.set("offset", String(filters.offset));

    const base = jobId
      ? `/api/admin/upload-files/history/${jobId}`
      : `/api/admin/upload-files/history`;
    const res = await fetch(`${base}?${params.toString()}`, {
      credentials: "include",
    });
    const json = (await res.json()) as {
      error?: string;
      rows?: FileUploadRow[];
      total?: number;
      limit?: number;
      offset?: number;
    };
    if (!res.ok || !json.rows) {
      throw new Error(json.error ?? "Could not list upload history.");
    }
    return {
      rows: json.rows,
      total: json.total ?? 0,
      limit: json.limit ?? 0,
      offset: json.offset ?? 0,
    };
  },

  // GET /upload-files/[id]/candidate-applications -- jobs the matched (duplicate) candidate has already applied to
  getCandidateApplications: async (
    fileUploadId: string,
  ): Promise<CandidateApplicationSummary[]> => {
    const res = await fetch(
      `/api/admin/upload-files/${fileUploadId}/candidate-applications`,
      { credentials: "include" },
    );
    const json = (await res.json()) as {
      error?: string;
      applications?: CandidateApplicationSummary[];
    };
    if (!res.ok || !json.applications) {
      throw new Error(
        json.error ?? "Could not load the candidate's applications.",
      );
    }
    return json.applications;
  },

  // GET /upload-files/history/[jobId]/batch/[id] -- every row's progress for one batch, unpaginated
  getUploadByBatchId: async (
    jobId: string,
    batchId: string,
  ): Promise<FileUploadProgressRow[]> => {
    const res = await fetch(
      `/api/admin/upload-files/history/${jobId}/batch/${batchId}`,
      { credentials: "include" },
    );
    const json = (await res.json()) as {
      error?: string;
      files?: FileUploadProgressRow[];
    };
    if (!res.ok || !json.files) {
      throw new Error(json.error ?? "Could not list upload batch.");
    }
    return json.files;
  },

  // POST /upload-files/sign-urls -- presigned S3 PUT URLs for rows already
  // registered via createUploadHistory (storage_key is minted there, not here)
  createSignedUploadUrls: async (
    files: FileUploadRow[],
  ): Promise<FileResult[]> => {
    const signBatch = async (batch: FileUploadRow[]): Promise<FileResult[]> => {
      const res = await fetch("/api/admin/upload-files/sign-urls", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: batch.map((f) => ({
            filename: f.file_name,
            storageKey: f.storage_key,
            mimeType: f.mime_type ?? null,
          })),
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        files?: FileResult[];
      };
      if (!res.ok || !json.files) {
        throw new Error(json.error ?? "Could not create signed upload URLs.");
      }
      return json.files;
    };

    const batches: FileUploadRow[][] = [];
    for (let i = 0; i < files.length; i += MAX_BATCH_FILES) {
      batches.push(files.slice(i, i + MAX_BATCH_FILES));
    }

    // Batches run one at a time, a chunk failing outright doesn't stop the remaining chunks from running.
    const results: FileResult[] = [];
    for (const batch of batches) {
      try {
        results.push(...(await signBatch(batch)));
      } catch (e) {
        const message =
          e instanceof Error
            ? e.message
            : "Could not create signed upload URLs.";
        results.push(
          ...batch.map((f): FileResult => ({
            filename: f.file_name ?? "(unnamed)",
            ok: false,
            error: message,
          })),
        );
      }
    }
    return results;
  },

  // PUT to a presigned S3 URL -- direct-to-storage upload, not through our API
  uploadFileToS3: async (
    fileUploadId: string,
    file: File,
    signedUrl: string,
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch(signedUrl, {
        method: "PUT",
        body: file,
        headers: file.type ? { "Content-Type": file.type } : undefined,
      });
      if (!res.ok) {
        return { ok: false, error: "Could not upload file to storage." };
      }
      return { ok: true };
    } catch {
      try {
        await uploadCvService.changeUploadStatus(
          fileUploadId,
          FILE_UPLOAD_STATUS.Failed,
          500,
          "Could not upload file to storage.",
          FILE_UPLOAD_ERROR_STAGE.S3Upload,
        );
      } catch {}
      return { ok: false, error: "Could not upload file to storage." };
    }
  },

  // POST /upload-files/[id]/enqueue -- queue one row for AI processing; called once per file right after its own S3 upload succeeds
  enqueueFile: async (
    id: string,
    jobId?: string | null,
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch(`/api/admin/upload-files/${id}/enqueue`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: jobId ?? null }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        return {
          ok: false,
          error: json.error ?? "Could not enqueue file for processing.",
        };
      }
      return { ok: true };
    } catch {
      return { ok: false, error: "Could not enqueue file for processing." };
    }
  },

  // POST /upload-files/[id]/retry -- re-enqueue failed/stuck rows with retry priority
  retryFiles: async (
    files: FileUploadRow[],
  ): Promise<{ ok: boolean; error?: string }> => {
    const STALE_MS = 1000 * 60 * 2;
    const now = Date.now();
    const ids = files
      .filter((f) => {
        if (f.status === FILE_UPLOAD_STATUS.Completed) return false;
        if (f.status === FILE_UPLOAD_STATUS.Failed) return true;
        // Not failed yet, but stuck long enough that the queue likely dropped it
        return dayjs(f.updated_at).add(STALE_MS, "ms").valueOf() <= now;
      })
      .map((f) => f.id);
    if (ids.length === 0) return { ok: true };

    try {
      const res = await fetch("/api/admin/upload-files/retry", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const json = (await res.json()) as {
        error?: string;
        results?: RetryResult[];
      };
      if (!res.ok || !json.results) {
        return {
          ok: false,
          error: json.error ?? "Could not retry file processing.",
        };
      }
      const errors = json.results
        .filter((r): r is Extract<RetryResult, { ok: false }> => !r.ok)
        .map((r) => r.error);
      if (errors.length > 0) {
        return { ok: false, error: [...new Set(errors)].join(" ") };
      }
      return { ok: true };
    } catch {
      return { ok: false, error: "Could not retry file processing." };
    }
  },

  // POST /upload-files/sign-urls -- same endpoint as `createSignedUploadUrls`,
  // but for a single file that has no `file_uploads` row yet (manual-entry
  // tab: `storageKey` is minted client-side, no batch/history insert first).
  signSingleUploadUrl: async (
    filename: string,
    storageKey: string,
    mimeType: string | null,
  ): Promise<string> => {
    const res = await fetch("/api/admin/upload-files/sign-urls", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: [{ filename, storageKey, mimeType }] }),
    });
    const json = (await res.json()) as { error?: string; files?: FileResult[] };
    const file = json.files?.[0];
    if (!res.ok || !file?.ok) {
      const message = file && !file.ok ? file.error : json.error;
      throw new Error(message ?? "Could not create a signed upload URL.");
    }
    return file.signedUrl;
  },

  // Raw PUT to a presigned S3 URL -- no `file_uploads` row to flag on failure
  // (see `signSingleUploadUrl`), so this just throws for the caller to handle.
  uploadRawFileToS3: async (file: File, signedUrl: string): Promise<void> => {
    const res = await fetch(signedUrl, {
      method: "PUT",
      body: file,
      headers: file.type ? { "Content-Type": file.type } : undefined,
    });
    if (!res.ok) {
      throw new Error("Could not upload file to storage.");
    }
  },
};
