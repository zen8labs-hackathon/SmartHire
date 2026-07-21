import type { StaffProfileAccess } from "@/lib/admin/profile-access";
import {
  canViewJobViaAcl,
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

  if (
    permission === "job.manage" ||
    permission === "users.manage" ||
    permission === "pipelines.manage"
  ) {
    return access.isHr || hasRolePermission(access, permission);
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

export async function canViewSalary(
  db: QueryExecutor,
  access: StaffProfileAccess,
  jobId: string,
): Promise<boolean> {
  return can(db, access, "salary.view", { jobId });
}
