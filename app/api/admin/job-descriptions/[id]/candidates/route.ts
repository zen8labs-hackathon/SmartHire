import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { canViewSalary } from "@/lib/authz/can";
import { redactAdminRowSalary } from "@/lib/authz/redact-salary";
import { requireJobViewAccess } from "@/lib/authz/require-job-view";
import {
  parseCandidatesListQuery,
  queryCandidatesList,
} from "@/lib/candidates/candidates-list-query";
import { getPool } from "@/lib/db/config/client";
import { getJobById } from "@/lib/db/jobs";

type RouteContext = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: jobId } = await params;
  if (!UUID_RE.test(jobId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const jobAccess = await requireJobViewAccess(auth.access, jobId);
  if (!jobAccess.ok) return jobAccess.response;

  const db = getPool();
  const job = await getJobById(db, jobId);
  if (!job) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const url = new URL(request.url);
  const { query, error: parseError } = parseCandidatesListQuery(
    url.searchParams,
  );
  if (parseError) {
    return Response.json({ error: parseError }, { status: 400 });
  }

  const result = await queryCandidatesList(db, { ...query, jobId });

  if (result.error) {
    return Response.json({ error: result.error }, { status: 500 });
  }

  const viewSalary = await canViewSalary(db, auth.access, jobId);
  const candidates = result.candidates.map((row) =>
    redactAdminRowSalary(row, viewSalary),
  );

  return Response.json({
    candidates,
    pagination: result.pagination,
  });
}
