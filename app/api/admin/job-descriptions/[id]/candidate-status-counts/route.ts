import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requireJobViewAccess } from "@/lib/authz/require-job-view";
import { countCampaignAppliedByStageForJob } from "@/lib/db/campaign-applied-list";
import { countActiveApplicationsByJobIds } from "@/lib/db/campaign-applied";
import { getPool } from "@/lib/db/config/client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Applicant counts broken down by every (stage, sub-stage) pair configured
 * on this job's pipeline. Replaces the old fixed-`CandidateStatus`-enum tally
 * (`ALL_PIPELINE_STATUSES`) -- a custom pipeline's stages aren't a static
 * global set under DB7X2K, so the response is an ordered list, not a
 * `Record<CandidateStatus, number>`.
 */
export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: jobId } = await params;
  if (!jobId || !UUID_RE.test(jobId)) {
    return Response.json({ error: "Invalid job id." }, { status: 400 });
  }

  const jobAccess = await requireJobViewAccess(auth.access, jobId);
  if (!jobAccess.ok) return jobAccess.response;

  const db = getPool();
  const [counts, totalByJob] = await Promise.all([
    countCampaignAppliedByStageForJob(db, jobId),
    countActiveApplicationsByJobIds(db, [jobId]),
  ]);
  const total = totalByJob.get(jobId) ?? 0;
  return Response.json({ counts, total });
}
