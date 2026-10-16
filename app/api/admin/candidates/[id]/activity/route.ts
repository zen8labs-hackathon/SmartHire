import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requireJobViewForApplication } from "@/lib/authz/require-application-job-view";
import { getCandidateActivity } from "@/lib/candidates/activity";
import { getPool } from "@/lib/db/config/client";
import { logApiError } from "@/lib/logger";

type Ctx = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Unified activity feed (newest first); `?cursor=<iso>` returns older items. */
export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  const cursor = new URL(request.url).searchParams.get("cursor");
  if (cursor && Number.isNaN(Date.parse(cursor))) {
    return Response.json({ error: "Invalid cursor." }, { status: 400 });
  }
  try {
    const view = await requireJobViewForApplication(auth.access, id);
    if (!view.ok) return view.response;
    const result = await getCandidateActivity(getPool(), view.application, cursor);
    return Response.json(result);
  } catch (e) {
    logApiError("Candidate activity: GET failed", e, { applicationId: id });
    return Response.json({ error: "Failed to load activity." }, { status: 500 });
  }
}
