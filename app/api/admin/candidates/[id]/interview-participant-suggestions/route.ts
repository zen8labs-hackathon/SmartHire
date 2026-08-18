import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requireJobViewForApplication } from "@/lib/authz/require-application-job-view";
import { getCampaignAppliedById } from "@/lib/db/campaign-applied";
import { getPool } from "@/lib/db/config/client";
import { searchUsersByEmail } from "@/lib/db/users";
import { getDefaultInterviewParticipantEmails } from "@/lib/candidates/interview-participant-suggestions";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SEARCH_RESULTS = 25;

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Backs the interview-participant email field on the schedule-creation form:
 * no `q` -> default auto-fill suggestions (job permissions + chapter heads +
 * admin/hr, see getDefaultInterviewParticipantEmails); `q` (>=2 chars) ->
 * type-ahead search across all system users, shaped identically to
 * `/api/admin/accounts/search` so `JdViewerEmailSearch` can point at either.
 */
export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: campaignAppliedId } = await params;
  if (!campaignAppliedId || !UUID_RE.test(campaignAppliedId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const appAccess = await requireJobViewForApplication(auth.access, campaignAppliedId);
  if (!appAccess.ok) return appAccess.response;

  const db = getPool();

  const q = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() ?? "";
  if (q.length >= 2) {
    const users = await searchUsersByEmail(db, q, MAX_SEARCH_RESULTS);
    return Response.json({ accounts: users.map((u) => ({ email: u.email })) });
  }

  const campaignApplied = await getCampaignAppliedById(db, campaignAppliedId);
  if (!campaignApplied) {
    return Response.json({ error: "Application not found." }, { status: 404 });
  }

  const suggestions = await getDefaultInterviewParticipantEmails(
    db,
    campaignApplied.job_id,
  );
  return Response.json({ suggestions });
}
