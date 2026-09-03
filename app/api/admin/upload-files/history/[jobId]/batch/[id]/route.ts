import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { getPool } from "@/lib/db/config/client";
import { listFileUploadsByBatchId } from "@/lib/db/upload-history";
import { logApiError } from "@/lib/logger";
import { NextRequest } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: batchId } = await params;

  try {
    const db = getPool();
    const rows = await listFileUploadsByBatchId(db, batchId);
    return Response.json({ batchId, files: rows });
  } catch (e) {
    logApiError("Upload-files history batch: list failed", e, { batchId });
    return Response.json(
      { error: "Could not list upload batch." },
      { status: 500 },
    );
  }
}
