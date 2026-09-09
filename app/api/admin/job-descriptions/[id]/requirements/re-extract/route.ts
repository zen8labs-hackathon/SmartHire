import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requirePermissionOnJob } from "@/lib/authz/require-permission";
import { syncJobRequirementsFromJd } from "@/lib/jd/sync-job-requirements";
import { logApiError } from "@/lib/logger";

type RouteContext = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SKIP_MESSAGE: Record<string, string> = {
  job_gone: "Job description not found.",
  no_text:
    "This job has no job description or evaluation criteria text to extract from.",
  llm_disabled: "AI extraction is not configured on this environment.",
};

/**
 * Re-runs the AI extraction for this job's checklist and returns the result.
 * The whole list is replaced -- the extractor owns it, and it is the only
 * writer (there is no per-row edit endpoint).
 *
 * Unlike the JD-save path this reports failures to the caller: the recruiter
 * pressed a button and is waiting on the answer.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: jobId } = await params;
  if (!UUID_RE.test(jobId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const manageAccess = await requirePermissionOnJob(
    auth.access,
    "job.manage",
    jobId,
  );
  if (!manageAccess.ok) return manageAccess.response;

  let result;
  try {
    result = await syncJobRequirementsFromJd(jobId);
  } catch (e) {
    logApiError("Requirements re-extract failed", e, { jobId });
    return Response.json(
      {
        error:
          e instanceof Error
            ? `Extraction failed: ${e.message}`
            : "Extraction failed.",
      },
      { status: 502 },
    );
  }

  if (!result.ok) {
    if ("skipped" in result) {
      const status = result.skipped === "job_gone" ? 404 : 422;
      return Response.json(
        { error: SKIP_MESSAGE[result.skipped] ?? "Extraction skipped." },
        { status },
      );
    }
    return Response.json({ error: result.error }, { status: 502 });
  }

  return Response.json({
    ok: true,
    count: result.count,
    staleApplications: result.staleApplications,
  });
}
