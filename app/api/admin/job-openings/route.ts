import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { getPool } from "@/lib/db/config/client";
import { listJobs } from "@/lib/db/jobs";

/**
 * Job list for the "target campaign" pickers on the candidates dashboard
 * (upload modal, JD filter). Named `job-openings` for the old
 * `job_openings` table this used to query; DB7X2K merged that table into
 * `jobs`, so this now just lists `jobs` directly -- kept at this path since
 * both remaining callers already call it, and it's a distinct concern from
 * the JD list/detail routes under `job-descriptions`.
 */
export async function GET(request: Request) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const { rows } = await listJobs(getPool(), { limit: 200 });

  const jobOpenings = rows.map((job) => ({
    id: job.id,
    title: job.position,
    status: job.status,
    displayTitle: job.position,
  }));

  return Response.json({ jobOpenings });
}
