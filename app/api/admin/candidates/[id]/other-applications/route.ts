import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { getCampaignAppliedById } from "@/lib/db/campaign-applied";
import { listOtherApplicationsForCandidate } from "@/lib/db/campaign-applied-list";
import { getPool } from "@/lib/db/config/client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: campaignAppliedId } = await params;
  if (!campaignAppliedId || !UUID_RE.test(campaignAppliedId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const db = getPool();

  const current = await getCampaignAppliedById(db, campaignAppliedId);
  if (!current) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  try {
    const rows = await listOtherApplicationsForCandidate(
      db,
      current.candidate_id,
      campaignAppliedId,
    );

    const applications = rows.map((row) => ({
      id: row.id,
      cvDownloadUrl: `/api/admin/candidates/${row.id}/cv-download`,
      jobTitle: row.job_position ?? "—",
      jobDescriptionId: row.job_id,
      cvUploadedAt: row.cv_created_at
        ? row.cv_created_at.toISOString()
        : row.created_at.toISOString(),
      name: row.candidate_name ?? null,
    }));

    return Response.json({ applications });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
