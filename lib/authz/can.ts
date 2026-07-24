import type { StaffProfileAccess } from "@/lib/admin/profile-access";
import {
  canViewJobViaAcl,
  filterJobIdsViewableViaAcl,
  isChapterHeadGrantedOnJob,
} from "@/lib/authz/job-access";
import {
  roleHasPermission,
  type PermissionId,
} from "@/lib/authz/permissions";
import type { QueryExecutor } from "@/lib/db/config/client";

export type AuthzResource = {
  jobId?: string;
};

/** Role-catalog check (no resource scope). */
export function hasRolePermission(
  access: StaffProfileAccess,
  permission: PermissionId,
): boolean {
  return roleHasPermission(access.role, permission);
}

/** May enter /admin — same as historical `isStaff`. */
export function hasAdminAccess(access: StaffProfileAccess): boolean {
  return access.isStaff || roleHasPermission(access.role, "admin.access");
}

/**
 * Central authorization check.
 *
 * - Global manage permissions: HR/admin via role / `isHr`.
 * - `job.manage` with `jobId`: HR/admin, or ACL viewer (chapter head / email grant).
 * - `job.view` / `candidate.view` / `candidate.manage` with `jobId`:
 *   HR bypasses ACL; otherwise profile grant or chapter-head grant.
 * - `salary.view` with `jobId`: role has `salary.view` (HR/admin) OR chapter
 *   head on that job. Email-only viewers do not see salary.
 */
export async function can(
  db: QueryExecutor,
  access: StaffProfileAccess,
  permission: PermissionId,
  resource?: AuthzResource,
): Promise<boolean> {
  const jobId = resource?.jobId;

  if (permission === "admin.access") {
    return hasAdminAccess(access);
  }

  if (permission === "users.manage" || permission === "pipelines.manage") {
    return access.isHr || hasRolePermission(access, permission);
  }

  // Create without jobId: HR, or any chapter head (they own new JDs via chapter grant).
  // Per-job manage: HR/admin, or ACL viewer (chapter head / email grant).
  if (permission === "job.manage") {
    if (access.isHr || hasRolePermission(access, permission)) return true;
    if (!jobId) return access.headedChapterIds.length > 0;
    return canViewJobViaAcl(db, access.userId, jobId);
  }

  if (permission === "salary.view") {
    if (access.isHr || hasRolePermission(access, "salary.view")) {
      return true;
    }
    if (!jobId) return false;
    return isChapterHeadGrantedOnJob(db, access.userId, jobId);
  }

  if (
    permission === "job.view" ||
    permission === "candidate.view" ||
    permission === "candidate.manage"
  ) {
    if (access.isHr) return true;
    if (!hasRolePermission(access, permission)) return false;
    // Listing with no jobId: caller must filter rows by ACL.
    if (!jobId) return true;
    return canViewJobViaAcl(db, access.userId, jobId);
  }

  return hasRolePermission(access, permission);
}

export async function canViewJob(
  db: QueryExecutor,
  access: StaffProfileAccess,
  jobId: string,
): Promise<boolean> {
  return can(db, access, "job.view", { jobId });
}

/**
 * Batched form of {@link canViewJob} -- resolves visibility for many jobs in
 * one ACL query instead of one per job. Use when filtering a list of rows
 * that spans several jobs (e.g. every application for a candidate) instead
 * of calling {@link canViewJob} in a loop.
 */
export async function filterViewableJobIds(
  db: QueryExecutor,
  access: StaffProfileAccess,
  jobIds: readonly string[],
): Promise<Set<string>> {
  const distinctIds = [...new Set(jobIds)];
  if (access.isHr) return new Set(distinctIds);
  if (!hasRolePermission(access, "job.view")) return new Set();
  return filterJobIdsViewableViaAcl(db, access.userId, distinctIds);
}

export async function canViewSalary(
  db: QueryExecutor,
  access: StaffProfileAccess,
  jobId: string,
): Promise<boolean> {
  return can(db, access, "salary.view", { jobId });
}

/** Create new JDs — HR or any chapter head. */
export function canCreateJobs(access: StaffProfileAccess): boolean {
  return access.isHr || access.headedChapterIds.length > 0;
}

/**
 * Delete JD / change viewer grants on a job — HR, or chapter head granted on
 * that job (email-only viewers cannot).
 */
export async function canAdministerJobAcl(
  db: QueryExecutor,
  access: StaffProfileAccess,
  jobId: string,
): Promise<boolean> {
  if (access.isHr) return true;
  return isChapterHeadGrantedOnJob(db, access.userId, jobId);
}
