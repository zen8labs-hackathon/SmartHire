import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requirePermissionOnJob } from "@/lib/authz/require-permission";
import { getPool } from "@/lib/db/config/client";
import { getJobById } from "@/lib/db/jobs";
import { logApiError } from "@/lib/logger";
import { enqueueRescore } from "@/lib/position/enqueue-rescore";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Re-run AI JD-matching for every live application of the position, using the
 * current scoring criteria. Same queue job as the legacy rerun-ai-matching route.
 */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;
  const { id: jobId } = await ctx.params;
  const db = getPool();

  const job = await getJobById(db, jobId);
  if (!job || job.deleted_at) {
    return Response.json({ error: "Position not found." }, { status: 404 });
  }
  // Rescoring rewrites every application's score, so it needs manage access.
  const perm = await requirePermissionOnJob(auth.access, "candidate.manage", jobId);
  if (!perm.ok) return perm.response;

  const { rows } = await db.query<{
    id: string;
    candidate_id: string;
    active_cv_version_id: string;
  }>(
    `SELECT id, candidate_id, active_cv_version_id
     FROM campaign_applied
     WHERE job_id = $1 AND deleted_at IS NULL AND active_cv_version_id IS NOT NULL`,
    [jobId],
  );

  try {
    await enqueueRescore(
      jobId,
      auth.userId,
      rows.map((r) => ({
        applicationId: r.id,
        candidateId: r.candidate_id,
        activeCvVersionId: r.active_cv_version_id,
      })),
    );
  } catch (e) {
    logApiError("Position rescore enqueue: queue add failed", e, { jobId });
    return Response.json(
      { error: "Failed to enqueue candidates for rescoring." },
      { status: 500 },
    );
  }

  return Response.json({ queued: rows.length });
}
