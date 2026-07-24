import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { filterViewableJobIds } from "@/lib/authz/can";
import { requireJobViewForApplication } from "@/lib/authz/require-application-job-view";
import { listApplicationsForCandidate } from "@/lib/db/campaign-applied-list";
import { getPool } from "@/lib/db/config/client";
import { resolveApplicationStages } from "@/lib/candidates/resolve-application-stage";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Every application (`campaign_applied` row, current one included) for the
 * same person as `id` -- feeds the candidate-detail page's per-application
 * CV version accordion. CV versions themselves are fetched separately (and
 * lazily, per application) via the existing `cv-history` endpoint once a row
 * is expanded.
 */
export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: campaignAppliedId } = await params;
  if (!campaignAppliedId || !UUID_RE.test(campaignAppliedId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const appAccess = await requireJobViewForApplication(
    auth.access,
    campaignAppliedId,
  );
  if (!appAccess.ok) return appAccess.response;

  const db = getPool();
  const current = appAccess.application;

  try {
    const rows = await listApplicationsForCandidate(db, current.candidate_id);

    const viewableJobIds = await filterViewableJobIds(
      db,
      auth.access,
      rows.map((row) => row.job_id),
    );
    const visibleRows = rows.filter((row) => viewableJobIds.has(row.job_id));

    const resolvedByRow = await resolveApplicationStages(db, visibleRows);

    const visible = visibleRows.map((row) => ({
      id: row.id,
      jobTitle: row.job_position ?? "—",
      jobId: row.job_id,
      appliedAt: row.created_at.toISOString(),
      cvUploadedAt: row.cv_created_at
        ? row.cv_created_at.toISOString()
        : row.created_at.toISOString(),
      ...resolvedByRow.get(row)!,
    }));

    return Response.json({ applications: visible });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
