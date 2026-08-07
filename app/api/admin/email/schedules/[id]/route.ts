import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requirePermissionOnJob } from "@/lib/authz/require-permission";
import { getCampaignAppliedById } from "@/lib/db/campaign-applied";
import { getPool } from "@/lib/db/config/client";
import { cancelEmailSchedule, getEmailScheduleById } from "@/lib/db/email-schedules";

type RouteContext = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid id." }, { status: 400 });
  }

  const db = getPool();

  const url = new URL(request.url);
  const reason = url.searchParams.get("reason");

  const existing = await getEmailScheduleById(db, id);
  if (!existing?.campaign_applied_id) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const application = await getCampaignAppliedById(db, existing.campaign_applied_id);
  if (application?.job_id) {
    const access = await requirePermissionOnJob(
      auth.access,
      "candidate.manage",
      application.job_id,
    );
    if (!access.ok) return access.response;
  }

  const cancelled = await cancelEmailSchedule(db, id, reason ?? "Cancelled by HR.");
  if (!cancelled) {
    return Response.json(
      { error: "Schedule not found or already completed/cancelled." },
      { status: 404 },
    );
  }

  return Response.json({ schedule: cancelled });
}
