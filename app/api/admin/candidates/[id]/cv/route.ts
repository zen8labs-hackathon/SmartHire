import { requireUserForRequest } from "@/lib/admin/require-staff-request";
import { requireApplicationViewOrSeat } from "@/lib/authz/require-application-view-or-seat";
import { buildCvView } from "@/lib/candidates/cv-view";
import { getPool } from "@/lib/db/config/client";
import {
  getCvDetailVersionById,
  listCvDetailVersionsByCampaignApplied,
} from "@/lib/db/cv-detail-versions";
import { logApiError } from "@/lib/logger";

type Ctx = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One CV version (default: active) with parsed payload and a diff vs the previous version. */
export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireUserForRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  const versionParam = new URL(request.url).searchParams.get("version");
  const wanted = versionParam == null ? null : Number(versionParam);
  if (wanted != null && (!Number.isInteger(wanted) || wanted < 1)) {
    return Response.json({ error: "Invalid version." }, { status: 400 });
  }
  try {
    const view = await requireApplicationViewOrSeat(auth.access, auth.userId, id);
    if (!view.ok) return view.response;
    const db = getPool();

    // Ordered version_number DESC.
    const versions = await listCvDetailVersionsByCampaignApplied(db, id);
    let target = wanted != null ? versions.find((v) => v.version_number === wanted) : undefined;
    if (!target && wanted == null && view.application.active_cv_version_id) {
      target =
        versions.find((v) => v.id === view.application.active_cv_version_id) ??
        (await getCvDetailVersionById(db, view.application.active_cv_version_id)) ??
        undefined;
    }
    if (!target && wanted == null) target = versions[0];
    if (!target) return Response.json({ error: "CV version not found." }, { status: 404 });

    const prev =
      versions.find((v) => v.version_number < target!.version_number) ?? null;
    return Response.json({
      ...buildCvView(target, prev),
      isActive: target.id === view.application.active_cv_version_id,
      versionCount: versions.length,
    });
  } catch (e) {
    logApiError("Candidate CV: GET failed", e, { applicationId: id });
    return Response.json({ error: "Failed to load CV." }, { status: 500 });
  }
}
