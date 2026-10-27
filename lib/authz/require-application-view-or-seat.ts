import type { StaffProfileAccess } from "@/lib/admin/profile-access";
import { requireJobViewAccess } from "@/lib/authz/require-job-view";
import {
  getCampaignAppliedById,
  type CampaignAppliedRow,
} from "@/lib/db/campaign-applied";
import { getInterviewerSeatForApplication } from "@/lib/db/candidate-schedules";
import { getPool } from "@/lib/db/config/client";

export type ApplicationViewOrSeatResult =
  | {
      ok: true;
      application: CampaignAppliedRow;
      /** True when access comes only from an interviewer seat, not job ACL. */
      limited: boolean;
      /** For a limited viewer: whether they have submitted an evaluation. */
      submitted: boolean;
    }
  | { ok: false; response: Response };

/**
 * Like `requireJobViewForApplication`, but an interviewer assigned to a
 * non-canceled session for this application gets a limited view even
 * without job ACL.
 */
export async function requireApplicationViewOrSeat(
  access: StaffProfileAccess,
  userId: string,
  campaignAppliedId: string,
): Promise<ApplicationViewOrSeatResult> {
  const db = getPool();
  const application = await getCampaignAppliedById(db, campaignAppliedId);
  if (!application) {
    return {
      ok: false,
      response: Response.json({ error: "Not found." }, { status: 404 }),
    };
  }
  const jobAccess = await requireJobViewAccess(access, application.job_id);
  if (jobAccess.ok) {
    return { ok: true, application, limited: false, submitted: false };
  }
  if (application.mentor_profile_id === userId) {
    return { ok: true, application, limited: true, submitted: true };
  }
  const seat = await getInterviewerSeatForApplication(db, campaignAppliedId, userId);
  if (!seat) return jobAccess;
  return { ok: true, application, limited: true, submitted: seat.submitted };
}
