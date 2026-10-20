import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requirePermissionOnJob } from "@/lib/authz/require-permission";
import { cancelUpcomingSessions } from "@/lib/calendar/cascade";
import { listUpcomingActiveSchedulesForJob } from "@/lib/db/candidate-schedules";
import { getPool } from "@/lib/db/config/client";
import { getJobById, updateJob } from "@/lib/db/jobs";
import { queryPositionsWithEnrichment } from "@/lib/position/list-with-enrichment";
import {
  isPositionTransition,
  planTransition,
} from "@/lib/position/transition";

type Ctx = { params: Promise<{ id: string }> };

/** Open / put on hold / reopen / close. Uses existing `jobs.status` values only. */
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

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    /* handled below */
  }
  if (!isPositionTransition(body.to)) {
    return Response.json({ error: "Invalid transition." }, { status: 400 });
  }

  const plan = planTransition(job, body.to, {
    isHr: auth.access.isHr,
    userId: auth.userId,
  });
  if (!plan.ok) {
    return Response.json({ error: plan.error }, { status: plan.status });
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
          notify: body.notifyInterviewers !== false,
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
