import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
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

  const result = await queryCandidatesList(getPool(), query);

  if (result.error) {
    return Response.json({ error: result.error }, { status: 500 });
  }

  return Response.json({
    candidates: result.candidates,
    pagination: result.pagination,
  });
}
