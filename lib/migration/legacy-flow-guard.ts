import { getPool } from "@/lib/db/config/client";
import { legacyFlowResponse } from "@/lib/migration/legacy-flow";

/**
 * Write-API guards for jobs still on the legacy flow (`jobs.flow_version = 1`).
 * Return a ready 409 `JOB_LEGACY_FLOW` Response to hand back, or null to proceed.
 * Reads are never guarded. Call after auth/permission so 401/403/404 win.
 */

export async function guardLegacyJob(jobId: string | null | undefined): Promise<Response | null> {
  if (!jobId) return null;
  const { rows } = await getPool().query<{ flow_version: number }>(
    `SELECT flow_version FROM jobs WHERE id = $1 AND deleted_at IS NULL`,
    [jobId],
  );
  return rows[0]?.flow_version === 1 ? legacyFlowResponse() : null;
}

export async function guardLegacyApplication(applicationId: string): Promise<Response | null> {
  const { rows } = await getPool().query<{ flow_version: number }>(
    `SELECT j.flow_version FROM campaign_applied ca
       JOIN jobs j ON j.id = ca.job_id
      WHERE ca.id = $1`,
    [applicationId],
  );
  return rows[0]?.flow_version === 1 ? legacyFlowResponse() : null;
}
