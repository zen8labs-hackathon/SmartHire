import type { StaffProfileAccess } from "@/lib/admin/profile-access";
import { can, canAdministerJobAcl } from "@/lib/authz/can";
import type { CampaignAppliedRow } from "@/lib/db/campaign-applied";
import { getPool } from "@/lib/db/config/client";

/** True when `userId` is the Mentor assigned to this application. */
export function isAssignedMentor(
  application: Pick<CampaignAppliedRow, "mentor_profile_id">,
  userId: string,
): boolean {
  return !!application.mentor_profile_id && application.mentor_profile_id === userId;
}

/**
 * Probation decisions (Pass / Not pass / Extend) and Mentor notes: the
 * application's assigned Mentor, or anyone with `candidate.manage` on the job
 * (RM / HR / Admin).
 */
export async function canDecideProbation(
  access: StaffProfileAccess,
  application: Pick<CampaignAppliedRow, "mentor_profile_id" | "job_id">,
): Promise<boolean> {
  if (isAssignedMentor(application, access.userId)) return true;
  return can(getPool(), access, "candidate.manage", {
    jobId: application.job_id ?? undefined,
  });
}

/** Changing the Mentor after Hire: HR, Admin or the job's chapter head only. */
export async function canChangeMentor(
  access: StaffProfileAccess,
  jobId: string | null,
): Promise<boolean> {
  if (access.isAdmin || access.isHr) return true;
  if (!jobId) return false;
  return canAdministerJobAcl(getPool(), access, jobId);
}
