import type { StaffProfileAccess } from "@/lib/admin/profile-access";
import { requireJobViewAccess } from "@/lib/authz/require-job-view";
import {
  getCampaignAppliedById,
  type CampaignAppliedRow,
} from "@/lib/db/campaign-applied";
import { getPool } from "@/lib/db/config/client";

export type ApplicationJobAccessResult =
  | { ok: true; application: CampaignAppliedRow }
  | { ok: false; response: Response };

/**
 * Load a campaign_applied row and ensure the caller may view its job.
 */
export async function requireJobViewForApplication(
  access: StaffProfileAccess,
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
  const jobAccess = await requireJobViewAccess(access, application.job_id);
  if (!jobAccess.ok) return jobAccess;
  return { ok: true, application };
}
