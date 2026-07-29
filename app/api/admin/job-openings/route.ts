import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { getPool } from "@/lib/db/config/client";
import { listJobs, type JobStatus } from "@/lib/db/jobs";

const JOB_STATUSES: readonly JobStatus[] = ["Done", "Hiring", "Pending", "Closed"];

/**
 * Job list for the "target campaign" pickers on the candidates dashboard
 * (upload modal, JD filter). Named `job-openings` for the old
 * `job_openings` table this used to query; DB7X2K merged that table into
 * `jobs`, so this now just lists `jobs` directly -- kept at this path since
 * both remaining callers already call it, and it's a distinct concern from
 * the JD list/detail routes under `job-descriptions`.
 *
 * Accepts an optional `?status=` filter (e.g. the CV drawer's "Assign to
 * job" picker only wants `Hiring` jobs) -- omitted entirely, other callers
 * keep seeing every status like before.
 */
export async function GET(request: Request) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const statusParam = new URL(request.url).searchParams.get("status");
  const status =
    statusParam && (JOB_STATUSES as readonly string[]).includes(statusParam)
      ? (statusParam as JobStatus)
      : undefined;

  const { rows } = await listJobs(getPool(), { limit: 200, status });

  const jobOpenings = rows.map((job) => ({
    id: job.id,
    title: job.position,
    status: job.status,
    displayTitle: job.position,
    createdAt: job.created_at,
  }));

  return Response.json({ jobOpenings });
}
