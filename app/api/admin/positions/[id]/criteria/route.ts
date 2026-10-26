import { guardLegacyJob } from "@/lib/migration/legacy-flow-guard";
import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requirePermissionOnJob } from "@/lib/authz/require-permission";
import { getPool } from "@/lib/db/config/client";
import { getJobById } from "@/lib/db/jobs";
import { parseCriteria, savePositionCriteria } from "@/lib/position/save-criteria";

type Ctx = { params: Promise<{ id: string }> };

/** Replace the position's scoring criteria (HR / Chapter Head edits). */
export async function PUT(request: Request, ctx: Ctx) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const job = await getJobById(getPool(), id);
  if (!job || job.deleted_at) {
    return Response.json({ error: "Position not found." }, { status: 404 });
  }
  const perm = await requirePermissionOnJob(auth.access, "job.manage", id);
  if (!perm.ok) return perm.response;
  const legacy = await guardLegacyJob(id);
  if (legacy) return legacy;

  let body: { criteria?: unknown };
  try {
    body = (await request.json()) as { criteria?: unknown };
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = parseCriteria(body.criteria);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  try {
    return Response.json(await savePositionCriteria(id, parsed.items));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save criteria.";
    return Response.json({ error: message }, { status: 500 });
  }
}
