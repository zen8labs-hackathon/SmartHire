import type { StaffProfileAccess } from "@/lib/admin/profile-access";
import { canViewJob } from "@/lib/authz/can";
import { getPool } from "@/lib/db/config/client";

export type JobAccessAuthResult =
  | { ok: true }
  | { ok: false; response: Response };

/**
 * After staff auth, ensure the caller may view the given job.
 * HR/admin always pass; recruiters need profile grant or chapter-head grant.
 */
export async function requireJobViewAccess(
  access: StaffProfileAccess,
  jobId: string,
): Promise<JobAccessAuthResult> {
  const allowed = await canViewJob(getPool(), access, jobId);
  if (!allowed) {
    return {
      ok: false,
      response: Response.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true };
}
