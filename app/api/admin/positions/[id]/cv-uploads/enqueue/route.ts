import { guardLegacyJob } from "@/lib/migration/legacy-flow-guard";
import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requirePermissionOnJob } from "@/lib/authz/require-permission";
import { MAX_BATCH_FILES } from "@/lib/candidates/upload-constants";
import { getPool } from "@/lib/db/config/client";
import {
  FILE_UPLOAD_ERROR_STAGE,
  FILE_UPLOAD_STATUS,
  getFileUploadsByIds,
  updateFileUploadById,
} from "@/lib/db/upload-history";
import { logApiError } from "@/lib/logger";
import { POOL_ID } from "@/lib/position/cv-upload";
import { fileUploadQueue } from "@/lib/queue/file-upload.queue";

type Ctx = { params: Promise<{ id: string }> };

export type EnqueueResult = { id: string; ok: boolean; error?: string };

/**
 * Step 3: after the browser PUT the files to S3, queue them for parsing /
 * scoring. Only rows that belong to this position (or the pool) and were
 * uploaded by the caller are accepted.
 */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const jobId = id === POOL_ID ? null : id;

  if (jobId) {
    const perm = await requirePermissionOnJob(auth.access, "candidate.manage", jobId);
    if (!perm.ok) return perm.response;
    const legacy = await guardLegacyJob(jobId);
    if (legacy) return legacy;
  }

  let body: { fileUploadIds?: unknown };
  try {
    body = (await request.json()) as { fileUploadIds?: unknown };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const ids = Array.isArray(body.fileUploadIds)
    ? body.fileUploadIds.filter((x): x is string => typeof x === "string")
    : [];
  if (ids.length === 0 || ids.length > MAX_BATCH_FILES) {
    return Response.json({ error: "Invalid file list." }, { status: 400 });
  }

  const db = getPool();
  const rows = await getFileUploadsByIds(db, ids);
  const byId = new Map(rows.map((r) => [String(r.id), r]));

  const results: EnqueueResult[] = [];
  for (const fid of ids) {
    const row = byId.get(fid);
    if (!row || (row.job_id ?? null) !== jobId || row.uploaded_by !== auth.userId) {
      results.push({ id: fid, ok: false, error: "Upload not found." });
      continue;
    }
    if (row.status === FILE_UPLOAD_STATUS.Processing) {
      results.push({ id: fid, ok: false, error: "Already being processed." });
      continue;
    }
    try {
      await fileUploadQueue.add(
        jobId ? "upload-cv" : "upload-candidate",
        { fileUploadId: row.id },
        { deduplication: { id: `cv-${row.id}-${jobId ?? "candidate"}` }, priority: 5 },
      );
      results.push({ id: fid, ok: true });
    } catch (e) {
      logApiError("Position CV upload: queue add failed", e, { fileUploadId: fid });
      try {
        await updateFileUploadById(db, row.id, {
          status: FILE_UPLOAD_STATUS.Failed,
          errorCode: 500,
          errorMessage: "Failed to enqueue file for processing.",
          errorStage: FILE_UPLOAD_ERROR_STAGE.Queue,
        });
      } catch (err) {
        console.error("Cannot update file status:", err);
      }
      results.push({ id: fid, ok: false, error: "Failed to enqueue file." });
    }
  }
  return Response.json({ results });
}
