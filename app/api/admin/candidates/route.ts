import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { canViewSalary } from "@/lib/authz/can";
import { redactAdminRowSalary } from "@/lib/authz/redact-salary";
import { requireJobViewAccess } from "@/lib/authz/require-job-view";
import {
  parseCandidatesListQuery,
  queryCandidatesList,
} from "@/lib/candidates/candidates-list-query";
import { getPool } from "@/lib/db/config/client";

export async function GET(request: Request) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const { query, error: parseError } = parseCandidatesListQuery(url.searchParams);
  if (parseError) {
    return Response.json({ error: parseError }, { status: 400 });
  }

  const jobIdParam = url.searchParams.get("jobId");
  if ((jobIdParam == null || jobIdParam === "") && !auth.access.isHr) {
    return Response.json(
      { error: "jobId is required for this account." },
      { status: 400 },
    );
  }

  if (query.jobId) {
    const jobAccess = await requireJobViewAccess(auth.access, query.jobId);
    if (!jobAccess.ok) return jobAccess.response;
  }

  const db = getPool();
  const result = await queryCandidatesList(db, query);

  if (result.error) {
    return Response.json({ error: result.error }, { status: 500 });
  }

  // Redact expected_salary unless HR or chapter head on that job.
  // For multi-job HR lists, check per row; for single-job lists, one check.
  let candidates = result.candidates;
  if (query.jobId) {
    const viewSalary = await canViewSalary(db, auth.access, query.jobId);
    candidates = candidates.map((row) => redactAdminRowSalary(row, viewSalary));
  } else if (!auth.access.isHr) {
    candidates = candidates.map((row) => redactAdminRowSalary(row, false));
  } else {
    // HR: keep salary on all rows
  }

  return Response.json({
    candidates,
    pagination: result.pagination,
  });
}
