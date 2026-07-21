import { isChapterHeadGrantedOnJob } from "@/lib/authz/job-access";
import type { QueryExecutor } from "@/lib/db/config/client";
import { listChapterIdsForUser } from "@/lib/db/profile-chapters";
import { getPublicUserById, type ProfileRole } from "@/lib/db/users";

export type StaffProfileAccess = {
  userId: string;
  email: string;
  role: ProfileRole;
  /** Superuser for RBAC: `role === 'admin'`. */
  isAdmin: boolean;
  /** Superuser for recruiting RBAC: admin or `role === 'hr'`. */
  isHr: boolean;
  /** May use the /admin app. `role !== 'none'` covers hr/recruiter/admin by
   * construction (see `syncRecruitingAccess`); the `chapterIds.length > 0`
   * fallback is defense-in-depth against a `role='none'` row that somehow
   * still has chapter memberships. */
  isStaff: boolean;
  /** Chapter memberships (recruiter scope); empty for HR-only, admin, or dashboard-only. */
  chapterIds: string[];
};

export async function getStaffProfileAccess(
  db: QueryExecutor,
  userId: string,
): Promise<StaffProfileAccess | null> {
  const user = await getPublicUserById(db, userId);
  if (!user) return null;

  const chapterIds = await listChapterIdsForUser(db, userId);

  const isAdmin = user.role === "admin";
  const isHr = isAdmin || user.role === "hr";
  const isStaff = user.role !== "none" || chapterIds.length > 0;

  return {
    userId,
    email: user.email,
    role: user.role,
    isAdmin,
    isHr,
    isStaff,
    chapterIds,
  };
}

export async function isProfileStaff(
  db: QueryExecutor,
  userId: string,
): Promise<boolean> {
  const access = await getStaffProfileAccess(db, userId);
  return access?.isStaff === true;
}

/**
 * True when the user is a `head` of a chapter granted on the job
 * (`job_allowed_chapters` ∩ `profile_chapters` where role = head).
 */
export async function isChapterHeadOnJob(
  db: QueryExecutor,
  userId: string,
  jobId: string,
): Promise<boolean> {
  return isChapterHeadGrantedOnJob(db, userId, jobId);
}
