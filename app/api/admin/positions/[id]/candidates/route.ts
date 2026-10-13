import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { canViewSalary } from "@/lib/authz/can";
import { requirePermissionOnJob } from "@/lib/authz/require-permission";
import { parseCandidatesListQuery } from "@/lib/candidates/candidates-list-query";
import { getPool } from "@/lib/db/config/client";
import { listPositionCandidates } from "@/lib/position/list-position-candidates";

type Ctx = { params: Promise<{ id: string }> };

/** Candidates of a position (+ the position's pipeline stages) for the new Candidates tab. */
export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const perm = await requirePermissionOnJob(auth.access, "job.view", id);
  if (!perm.ok) return perm.response;

  const { query, error } = parseCandidatesListQuery(new URL(request.url).searchParams);
  if (error) return Response.json({ error }, { status: 400 });

  try {
    const db = getPool();
    const viewSalary = await canViewSalary(db, auth.access, id);
    const result = await listPositionCandidates(db, id, {
      q: query.q,
      stageMappingId: query.stageMappingId,
      subStateId: query.subStateId,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
      // `all`/no limit → default page of 200 (the list's max page size).
      limit: query.all ? 200 : query.limit,
      offset: query.all ? 0 : query.offset,
      viewSalary,
    });
    if (!result) return Response.json({ error: "Position not found." }, { status: 404 });
    return Response.json(result);
  } catch (e) {
    console.error("[positions/candidates] GET failed", e);
    return Response.json({ error: "Failed to load candidates." }, { status: 500 });
  }
}
