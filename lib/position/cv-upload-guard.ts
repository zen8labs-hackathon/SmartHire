import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requirePermissionOnJob } from "@/lib/authz/require-permission";
import { getPool } from "@/lib/db/config/client";
import { getJobById } from "@/lib/db/jobs";
import { POOL_ID } from "@/lib/position/cv-upload";

/** Shared staff + `candidate.manage` guard for the position CV-upload routes. */
export async function guardPositionUpload(request: Request, id: string) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return { ok: false as const, response: auth.response };
  const jobId = id === POOL_ID ? null : id;
  if (jobId) {
    const job = await getJobById(getPool(), jobId);
    if (!job || job.deleted_at) {
      return {
        ok: false as const,
        response: Response.json({ error: "Position not found." }, { status: 404 }),
      };
    }
    const perm = await requirePermissionOnJob(auth.access, "candidate.manage", jobId);
    if (!perm.ok) return { ok: false as const, response: perm.response };
  }
  return { ok: true as const, auth, jobId };
}
