import { getPool } from "@/lib/db/config/client";
import {
  FILE_UPLOAD_STATUS,
  updateFileUploadById,
  type FileUploadErrorStage,
  type FileUploadStatus,
} from "@/lib/db/upload-history";
import { logApiError } from "@/lib/logger";
import { loadScopedUploads } from "@/lib/position/cv-upload-actions";
import { guardPositionUpload } from "@/lib/position/cv-upload-guard";

type Ctx = { params: Promise<{ id: string; fileId: string }> };

const VALID = new Set<string>(Object.values(FILE_UPLOAD_STATUS));

export async function PATCH(request: Request, ctx: Ctx) {
  const { id, fileId } = await ctx.params;
  const g = await guardPositionUpload(request, id);
  if (!g.ok) return g.response;
  let body: {
    status?: FileUploadStatus;
    errorCode?: number | null;
    errorMessage?: string | null;
    errorStage?: FileUploadErrorStage | null;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (body.status !== undefined && !VALID.has(body.status)) {
    return Response.json({ error: `Invalid status: ${body.status}` }, { status: 400 });
  }
  const db = getPool();
  const [row] = await loadScopedUploads(db, [fileId], g.jobId);
  if (!row) return Response.json({ error: "Upload not found." }, { status: 404 });
  try {
    const file = await updateFileUploadById(db, fileId, {
      status: body.status,
      errorCode: body.errorCode,
      errorMessage: body.errorMessage,
      errorStage: body.errorStage,
    });
    return Response.json({ file });
  } catch (e) {
    logApiError("Position CV change-status failed", e, { fileId });
    return Response.json({ error: "Database error" }, { status: 500 });
  }
}
