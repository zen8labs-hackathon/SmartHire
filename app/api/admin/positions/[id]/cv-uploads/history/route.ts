import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requirePermissionOnJob } from "@/lib/authz/require-permission";
import { getPool } from "@/lib/db/config/client";
import { logApiError } from "@/lib/logger";
import { POOL_ID } from "@/lib/position/cv-upload";
import { listCvUploadHistory } from "@/lib/position/cv-upload-history";

type Ctx = { params: Promise<{ id: string }> };

/** Upload batches (with per-file outcome) for a position, or the talent pool when `id` is "pool". */
export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const jobId = id === POOL_ID ? null : id;

  if (jobId) {
    const perm = await requirePermissionOnJob(auth.access, "candidate.manage", jobId);
    if (!perm.ok) return perm.response;
  }

  try {
    const batches = await listCvUploadHistory(getPool(), jobId);
    return Response.json({ batches });
  } catch (e) {
    logApiError("Position CV upload: history failed", e, { jobId });
    return Response.json({ error: "Could not load upload history." }, { status: 500 });
  }
}
