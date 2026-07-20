import type { QueryExecutor } from "@/lib/db/config/client";
import { listAllowedChaptersForJob } from "@/lib/db/job-permissions";
import { listChapterIdsForUser, listMembershipsForUser } from "@/lib/db/profile-chapters";
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
 * Replaces the pre-DB7X2K `isChapterHeadOnJobDescription`, which despite its
 * name never actually checked headship -- it just checked "does any chapter
 * have viewer access to this JD" (see DB7X2K log 09/10's "permission gap
 * found" note). This version does what the name says: true only when the
 * user is a `head` of a chapter that is itself granted access to the job
 * (composing two separate join tables -- `profile_chapters.role` no longer
 * lives on the same object as job-chapter grants under DB7X2K).
 */
export async function isChapterHeadOnJob(
  db: QueryExecutor,
  userId: string,
  jobId: string,
): Promise<boolean> {
  const [memberships, allowedChapters] = await Promise.all([
    listMembershipsForUser(db, userId),
    listAllowedChaptersForJob(db, jobId),
  ]);

  const headChapterIds = new Set(
    memberships.filter((m) => m.role === "head").map((m) => m.chapterId),
  );
  if (headChapterIds.size === 0) return false;

  return allowedChapters.some((c) => headChapterIds.has(c.chapter_id));
}
