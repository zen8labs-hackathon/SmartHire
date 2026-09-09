import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requireJobViewAccess } from "@/lib/authz/require-job-view";
import { getPool } from "@/lib/db/config/client";
import { listJobRequirements } from "@/lib/db/job-requirements";

type RouteContext = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * The job's requirement checklist, read-only. Rows are written only by the AI
 * extractor (`lib/jd/sync-job-requirements.ts`), on JD save or via the
 * `re-extract` route -- there is no per-row create/update/delete endpoint.
 */
export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: jobId } = await params;
  if (!UUID_RE.test(jobId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const jobAccess = await requireJobViewAccess(auth.access, jobId);
  if (!jobAccess.ok) return jobAccess.response;

  const requirements = await listJobRequirements(getPool(), jobId);
  return Response.json({ requirements });
}
