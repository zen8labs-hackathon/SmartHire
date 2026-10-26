import { guardLegacyJob } from "@/lib/migration/legacy-flow-guard";
import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requirePermissionOnJob } from "@/lib/authz/require-permission";
import { cancelUpcomingSessions } from "@/lib/calendar/cascade";
import { listUpcomingActiveSchedulesForJob } from "@/lib/db/candidate-schedules";
import { getPool } from "@/lib/db/config/client";
import { getJobById, updateJob } from "@/lib/db/jobs";
import { fetchJobPipelineConfig } from "@/lib/pipelines/transition-validator";
import { queryPositionsWithEnrichment } from "@/lib/position/list-with-enrichment";
import {
  isPositionTransition,
  planTransition,
  summarizeCloseState,
} from "@/lib/position/transition";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Open / put on hold / reopen / close. Uses existing `jobs.status` values only.
 * Hold and reopen require `reason` (AC-06-16). Close is refused with 409 and a
 * `blocking` list while candidates are still active in an offer/probation-type
 * stage (BR-06-13); otherwise per-stage counts are saved to `close_snapshot`.
 */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const db = getPool();

  const job = await getJobById(db, id);
  if (!job || job.deleted_at) {
    return Response.json({ error: "Position not found." }, { status: 404 });
  }
  const perm = await requirePermissionOnJob(auth.access, "job.manage", id);
  if (!perm.ok) return perm.response;
  const legacy = await guardLegacyJob(id);
  if (legacy) return legacy;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    /* handled below */
  }
  if (!isPositionTransition(body.to)) {
    return Response.json({ error: "Invalid transition." }, { status: 400 });
  }

  if (body.reason !== undefined && body.reason !== null && typeof body.reason !== "string") {
    return Response.json({ error: "reason must be a string." }, { status: 400 });
  }

  const plan = planTransition(job, body.to, {
    isHr: auth.access.isHr,
    userId: auth.userId,
    reason: body.reason as string | null | undefined,
  });
  if (!plan.ok) {
    return Response.json({ error: plan.error }, { status: plan.status });
  }

  if (body.to === "close") {
    const [{ stageMappings, subStages }, { rows }] = await Promise.all([
      fetchJobPipelineConfig(db, id),
      db.query<{
        id: string;
        name: string | null;
        current_job_stage_mapping_id: string | null;
        current_sub_state_id: string | null;
      }>(
        `SELECT ca.id, c.name, ca.current_job_stage_mapping_id, ca.current_sub_state_id
         FROM campaign_applied ca
         JOIN candidates c ON c.id = ca.candidate_id AND c.deleted_at IS NULL
         WHERE ca.job_id = $1 AND ca.deleted_at IS NULL`,
        [id],
      ),
    ]);
    const { snapshot, blocking } = summarizeCloseState(rows, stageMappings, subStages);
    if (blocking.length > 0) {
      return Response.json(
        {
          error: `${blocking.length} candidate${blocking.length === 1 ? " is" : "s are"} still in an offer or probation stage. Move or reject them before closing.`,
          blocking,
        },
        { status: 409 },
      );
    }
    plan.patch.closeSnapshot = snapshot;
  }

  try {
    await updateJob(db, id, plan.patch);
    // Closing or pausing the position cancels its upcoming interviews.
    if (body.to === "close" || body.to === "hold") {
      try {
        const upcoming = await listUpcomingActiveSchedulesForJob(db, id);
        await cancelUpcomingSessions(db, upcoming, {
          reason: body.to === "close" ? "The position was closed." : "The position was put on hold.",
          actorId: auth.userId,
          notify: body.notifyInterviewers === true,
        });
      } catch (e) {
        console.error("[positions/transition] interview cascade failed", id, e);
      }
    }
    const { positions } = await queryPositionsWithEnrichment(db, {
      q: id,
      limit: 1,
    });
    return Response.json({ position: positions.find((p) => p.id === id) ?? null });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update position.";
    return Response.json({ error: message }, { status: 500 });
  }
}
