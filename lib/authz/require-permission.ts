import type { StaffProfileAccess } from "@/lib/admin/profile-access";
import {
  can,
  canAdministerJobAcl,
  canCreateJobs,
} from "@/lib/authz/can";
import type { PermissionId } from "@/lib/authz/permissions";
import type { ApplicationJobAccessResult } from "@/lib/authz/require-application-job-view";
import type { JobAccessAuthResult } from "@/lib/authz/require-job-view";
import { getCampaignAppliedById } from "@/lib/db/campaign-applied";
import { getPool } from "@/lib/db/config/client";

/**
 * After staff auth, ensure the caller has `permission` on the given job
 * (HR bypass / role catalog / job ACL as implemented in {@link can}).
 */
export async function requirePermissionOnJob(
  access: StaffProfileAccess,
  permission: PermissionId,
  jobId: string,
): Promise<JobAccessAuthResult> {
  const allowed = await can(getPool(), access, permission, { jobId });
  if (!allowed) {
    return {
      ok: false,
      response: Response.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true };
}

/**
 * Load a campaign_applied row and ensure the caller has `permission` on its job.
 */
export async function requirePermissionForApplication(
  access: StaffProfileAccess,
  permission: PermissionId,
  campaignAppliedId: string,
): Promise<ApplicationJobAccessResult> {
  const application = await getCampaignAppliedById(
    getPool(),
    campaignAppliedId,
  );
  if (!application) {
    return {
      ok: false,
      response: Response.json({ error: "Not found." }, { status: 404 }),
    };
  }

  const jobAccess = await requirePermissionOnJob(
    access,
    permission,
    application.job_id,
  );
  if (!jobAccess.ok) return jobAccess;

  return { ok: true, application };
}

/** Create JD — HR or chapter head. */
export function requireCanCreateJobs(
  access: StaffProfileAccess,
): JobAccessAuthResult {
  if (!canCreateJobs(access)) {
    return {
      ok: false,
      response: Response.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true };
}

/** Delete JD / change viewers — HR or chapter head on that job. */
export async function requireAdministerJobAcl(
  access: StaffProfileAccess,
  jobId: string,
): Promise<JobAccessAuthResult> {
  const allowed = await canAdministerJobAcl(getPool(), access, jobId);
  if (!allowed) {
    return {
      ok: false,
      response: Response.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true };
}
