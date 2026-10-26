import { requireUserForRequest } from "@/lib/admin/require-staff-request";
import { requirePermissionOnJob } from "@/lib/authz/require-permission";
import { getPool } from "@/lib/db/config/client";
import { listAllowedProfilesForJob } from "@/lib/db/job-permissions";
import { getJobById } from "@/lib/db/jobs";
import { getUsersByIds } from "@/lib/db/users";

type Ctx = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PositionMember = { id: string; name: string; email: string; role: "recruiter" | "interviewer" };

/** People already added to the position -- the pool a probation Mentor is chosen from. */
export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireUserForRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id) || !(await getJobById(getPool(), id))) {
    return Response.json({ error: "Position not found." }, { status: 404 });
  }
  const perm = await requirePermissionOnJob(auth.access, "candidate.manage", id);
  if (!perm.ok) return perm.response;

  const grants = await listAllowedProfilesForJob(getPool(), id);
  const users = await getUsersByIds(getPool(), grants.map((g) => g.profile_id));
  const members: PositionMember[] = grants.flatMap((g) => {
    const u = users.find((x) => x.id === g.profile_id);
    return u ? [{ id: u.id, name: u.username, email: u.email, role: g.role }] : [];
  });
  return Response.json({ members });
}
