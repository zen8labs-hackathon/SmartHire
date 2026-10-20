import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requireApplicationViewOrSeat } from "@/lib/authz/require-application-view-or-seat";
import { parseJdMatchRationale } from "@/lib/candidates/jd-match-rationale";
import { buildMatchView } from "@/lib/candidates/match-view";
import { listCriterionOverrides } from "@/lib/db/candidate-criterion-overrides";
import { getPool } from "@/lib/db/config/client";
import { getCvDetailVersionById } from "@/lib/db/cv-detail-versions";
import { listJobRequirements } from "@/lib/db/job-requirements";
import { logApiError } from "@/lib/logger";

type Ctx = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Score, composition, summary and per-criterion verdicts (overrides layered on). */
export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  try {
    const view = await requireApplicationViewOrSeat(auth.access, auth.userId, id);
    if (!view.ok) return view.response;
    if (view.limited && !view.submitted) {
      return Response.json({
        hidden: true,
        reason: "Submit your evaluation to see the AI match.",
      });
    }
    const app = view.application;
    const db = getPool();

    const [cv, overrides, requirements] = await Promise.all([
      app.active_cv_version_id
        ? getCvDetailVersionById(db, app.active_cv_version_id)
        : Promise.resolve(null),
      listCriterionOverrides(db, id),
      app.job_id ? listJobRequirements(db, app.job_id) : Promise.resolve([]),
    ]);

    return Response.json(
      buildMatchView({
        application: app,
        cv,
        rationale: parseJdMatchRationale(
          cv?.jd_match_rationale ?? app.jd_match_rationale,
        ),
        overrides,
        requirements,
      }),
    );
  } catch (e) {
    logApiError("Candidate match: GET failed", e, { applicationId: id });
    return Response.json({ error: "Failed to load match." }, { status: 500 });
  }
}
