import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { getPool } from "@/lib/db/config/client";
import {
  FILE_UPLOAD_STATUS,
  getFileUploadById,
  updateFileUploadById,
  type FileUploadErrorStage,
  type FileUploadStatus,
} from "@/lib/db/upload-history";
import { logApiError } from "@/lib/logger";
import { NextRequest } from "next/server";

const VALID_STATUSES = new Set<string>(Object.values(FILE_UPLOAD_STATUS));

type RouteContext = { params: Promise<{ id: string }> };

type Body = {
  status?: FileUploadStatus;
  errorCode?: number | null;
  errorMessage?: string | null;
  errorStage?: FileUploadErrorStage | null;
};

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.status !== undefined && !VALID_STATUSES.has(body.status)) {
    return Response.json(
      { error: `Invalid status: ${body.status}` },
      { status: 400 },
    );
  }

  const db = getPool();

  const existing = await getFileUploadById(db, id);
  if (!existing) {
    return Response.json({ error: "Upload data not found." }, { status: 404 });
  }

  try {
    const row = await updateFileUploadById(db, id, {
      status: body.status,
      errorCode: body.errorCode,
      errorMessage: body.errorMessage,
      errorStage: body.errorStage,
    });
    return Response.json({ file: row });
  } catch (e) {
    logApiError("Upload-files change-status: update failed", e, { id });
    return Response.json(
      { error: "Could not update upload status." },
      { status: 500 },
    );
  }
}
