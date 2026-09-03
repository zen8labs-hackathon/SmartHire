import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import {
  CV_FOLDER_PREFIX,
  isAllowedCvFilename,
} from "@/lib/candidates/upload-constants";
import { getPool } from "@/lib/db/config/client";
import {
  getFileUploadById,
  updateFileUploadById,
} from "@/lib/db/upload-history";
import { logApiError } from "@/lib/logger";
import { NextRequest } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

type Body = {
  candidateId?: string | null;
  storageKey?: string;
  fileName?: string;
  fileHash?: string | null;
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
  if (body.fileName !== undefined && !isAllowedCvFilename(body.fileName)) {
    return Response.json(
      { error: `Only .pdf and .docx files are allowed: ${body.fileName}` },
      { status: 400 },
    );
  }
  if (
    body.storageKey !== undefined &&
    (!body.storageKey.startsWith(CV_FOLDER_PREFIX) ||
      body.storageKey.includes(".."))
  ) {
    return Response.json({ error: "Invalid storage key." }, { status: 400 });
  }

  const db = getPool();

  const existing = await getFileUploadById(db, id);
  if (!existing) {
    return Response.json({ error: "Upload data not found." }, { status: 404 });
  }

  try {
    const row = await updateFileUploadById(db, id, {
      candidateId: body.candidateId,
      storageKey: body.storageKey,
      fileName: body.fileName,
      fileHash: body.fileHash,
    });
    return Response.json({ file: row });
  } catch (e) {
    logApiError("Upload-files: update failed", e, { id });
    return Response.json(
      { error: "Could not update upload data." },
      { status: 500 },
    );
  }
}
