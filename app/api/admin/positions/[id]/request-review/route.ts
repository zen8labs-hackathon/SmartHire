import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requirePermissionOnJob } from "@/lib/authz/require-permission";
import { getPool } from "@/lib/db/config/client";
import { getJobById } from "@/lib/db/jobs";
import { createNotification, NOTIFICATION_TYPE } from "@/lib/db/notifications";
import { logApiError } from "@/lib/logger";
import { isDraft } from "@/lib/position/jd-state";
import { recipientIds } from "@/lib/position/process-jd";

type Ctx = { params: Promise<{ id: string }> };

/** Asks HR and the chapter heads to review a Draft before it is opened. */
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
  if (!isDraft(job)) {
    return Response.json(
      { error: "Only Draft positions can be sent for review." },
      { status: 409 },
    );
  }

  const ids = (await recipientIds(db, id, job.created_by)).filter(
    (u) => u !== auth.userId,
  );
  await Promise.all(
    ids.map((userId) =>
      createNotification(db, {
        userId,
        type: NOTIFICATION_TYPE.ReviewRequested,
        title: `Review requested: ${job.position}`,
        body: "A draft position is ready for review before opening.",
        data: { jobId: id },
      }).catch((e) => logApiError("Review notification failed", e)),
    ),
  );
  return Response.json({ ok: true, notified: ids.length });
}
