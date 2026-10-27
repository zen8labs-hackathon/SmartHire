import { guardLegacyJob } from "@/lib/migration/legacy-flow-guard";
import { requireUserForRequest } from "@/lib/admin/require-staff-request";
import { requirePermissionForApplication } from "@/lib/authz/require-permission";
import { logApiError } from "@/lib/logger";
import { enqueueRescore } from "@/lib/position/enqueue-rescore";

type Ctx = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Re-run AI JD-matching for one application against the current criteria. */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireUserForRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  const perm = await requirePermissionForApplication(
    auth.access,
    "candidate.manage",
    id,
  );
  if (!perm.ok) return perm.response;
  {
    const legacy = await guardLegacyJob(perm.application.job_id);
    if (legacy) return legacy;
  }
  const app = perm.application;
  if (!app.job_id || !app.active_cv_version_id) {
    return Response.json(
      { error: "Application has no job or CV to score." },
      { status: 409 },
    );
  }
  try {
    await enqueueRescore(app.job_id, auth.userId, [
      {
        applicationId: app.id,
        candidateId: app.candidate_id,
        activeCvVersionId: app.active_cv_version_id,
      },
    ]);
  } catch (e) {
    logApiError("Candidate rescore: enqueue failed", e, { applicationId: id });
    return Response.json({ error: "Failed to enqueue rescoring." }, { status: 500 });
  }
  return Response.json({ queued: 1 });
}
