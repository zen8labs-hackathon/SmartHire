import { requireHrForRequest } from "@/lib/admin/require-staff-request";
import { getPool, withTransaction } from "@/lib/db/config/client";
import { getCandidate2Detail } from "@/lib/db/candidates-detail2";
import { getCampaignAppliedById } from "@/lib/db/campaign-applied";
import { getCvDetailVersionById } from "@/lib/db/cv-detail-versions";
import { applyManualProfileEdit } from "@/lib/candidates/apply-manual-profile-edit";
import { EXPERIENCE_YEARS_MAX, candidateProfilePatchSchema } from "@/lib/candidates/candidate-profile-patch";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Set a candidate's experience years on one application by layering a
 * `manual_edit` CV version (UC-02-03 "use CV value", UC-02-04 "revert to AI").
 * Body: { applicationId, years, summary }.
 */
export async function PUT(request: Request, { params }: RouteContext) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  let body: { applicationId?: unknown; years?: unknown; summary?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { applicationId, years } = body;
  const summary = typeof body.summary === "string" ? body.summary.trim().slice(0, 500) : "";
  if (typeof applicationId !== "string" || !UUID_RE.test(applicationId)) {
    return Response.json({ error: "applicationId is required." }, { status: 400 });
  }
  if (typeof years !== "number" || !Number.isFinite(years) || years < 0 || years > EXPERIENCE_YEARS_MAX) {
    return Response.json({ error: "Enter a valid number of years." }, { status: 400 });
  }

  try {
    const db = getPool();
    const app = await getCampaignAppliedById(db, applicationId);
    if (!app || app.candidate_id !== id) {
      return Response.json({ error: "Application not found." }, { status: 404 });
    }
    if (!app.active_cv_version_id) {
      return Response.json({ error: "No CV file on record." }, { status: 404 });
    }
    const base = await getCvDetailVersionById(db, app.active_cv_version_id);
    if (!base) return Response.json({ error: "Active CV version not found." }, { status: 404 });

    const result = await withTransaction((tx) =>
      applyManualProfileEdit(tx, {
        campaignAppliedId: applicationId,
        candidateId: id,
        baseCvVersion: base,
        nextSource: app.source,
        nextSourceOther: app.source_other,
        patch: candidateProfilePatchSchema.parse({
          experience_years: years,
          change_summary: summary || undefined,
        }),
        createdBy: auth.userId ?? null,
        skipContactFields: true,
      }),
    );

    const detail = await getCandidate2Detail(db, id);
    return Response.json({
      ...detail,
      applicationId,
      rescore: result.matchAffectingFieldsChanged,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update experience.";
    return Response.json({ error: message }, { status: 500 });
  }
}
