import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requireJobViewAccess } from "@/lib/authz/require-job-view";
import { getPool } from "@/lib/db/config/client";
import { fetchJobPipelineConfig } from "@/lib/pipelines/transition-validator";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_JOB_IDS = 50;

/**
 * Batched pipeline config (stage/sub-stage mappings) for a set of jobs, keyed
 * by job id. The cross-job candidates dashboard (`/admin/candidates`) shows
 * applications from many different jobs on one page, each potentially on a
 * different custom pipeline -- unlike the JD-scoped pipeline table, which
 * only ever needs one job's config and fetches it server-side. This lets the
 * dashboard fetch every distinct job's config it actually needs in one round
 * trip instead of one request per row.
 */
export async function GET(request: Request) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const raw = url.searchParams.get("jobIds") ?? "";
  const jobIds = [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))].filter((id) =>
    UUID_RE.test(id),
  );

  if (jobIds.length === 0) {
    return Response.json({ configs: {} });
  }
  if (jobIds.length > MAX_JOB_IDS) {
    return Response.json({ error: `Too many job ids (max ${MAX_JOB_IDS}).` }, { status: 400 });
  }

  const allowedIds: string[] = [];
  for (const jobId of jobIds) {
    const jobAccess = await requireJobViewAccess(auth.access, jobId);
    if (jobAccess.ok) allowedIds.push(jobId);
  }

  const db = getPool();
  const entries = await Promise.all(
    allowedIds.map(async (jobId) => [jobId, await fetchJobPipelineConfig(db, jobId)] as const),
  );

  return Response.json({ configs: Object.fromEntries(entries) });
}
