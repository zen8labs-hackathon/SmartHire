import { requireHrForRequest } from "@/lib/admin/require-staff-request";
import { getPool } from "@/lib/db/config/client";
import { getCampaignAppliedById } from "@/lib/db/campaign-applied";
import { guardLegacyJob } from "@/lib/migration/legacy-flow-guard";
import { logApiError } from "@/lib/logger";
import { enqueueRescore } from "@/lib/position/enqueue-rescore";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Re-run the AI JD-match for one of the candidate's applications against the
 * position's current criteria (BR-08-08). Body: { applicationId }.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  let body: { applicationId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { applicationId } = body;
  if (typeof applicationId !== "string" || !UUID_RE.test(applicationId)) {
    return Response.json({ error: "applicationId is required." }, { status: 400 });
  }

  try {
    const app = await getCampaignAppliedById(getPool(), applicationId);
    if (!app || app.candidate_id !== id) {
      return Response.json({ error: "Application not found." }, { status: 404 });
    }
    const legacy = await guardLegacyJob(app.job_id);
    if (legacy) return legacy;
    if (!app.job_id || !app.active_cv_version_id) {
      return Response.json(
        { error: "Application has no position or CV to score." },
        { status: 409 },
      );
    }
    await enqueueRescore(app.job_id, auth.userId, [
      {
        applicationId: app.id,
        candidateId: app.candidate_id,
        activeCvVersionId: app.active_cv_version_id,
      },
    ]);
    return Response.json({ queued: 1 });
  } catch (e) {
    logApiError("Talent Pool rescore: enqueue failed", e, { applicationId });
    return Response.json({ error: "Failed to enqueue rescoring." }, { status: 500 });
  }
}
