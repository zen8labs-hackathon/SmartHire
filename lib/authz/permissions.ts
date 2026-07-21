/**
 * Permission catalog IDs — mirrors the `permissions` seed table.
 * Keep in sync with migrations/*_permissions-catalog.sql.
 */
export const PERMISSIONS = [
  "admin.access",
  "job.view",
  "job.manage",
  "candidate.view",
  "candidate.manage",
  "salary.view",
  "users.manage",
  "pipelines.manage",
] as const;

export type PermissionId = (typeof PERMISSIONS)[number];

export type ProfileRoleForPermissions = "admin" | "hr" | "recruiter" | "none";

/** Default role → permission map (mirrors `role_permissions` seed). */
export const ROLE_PERMISSIONS: Record<
  ProfileRoleForPermissions,
  ReadonlySet<PermissionId>
> = {
  admin: new Set(PERMISSIONS),
  hr: new Set(PERMISSIONS),
  recruiter: new Set([
    "admin.access",
    "job.view",
    "candidate.view",
    "candidate.manage",
  ]),
  none: new Set(),
};

export function roleHasPermission(
  role: ProfileRoleForPermissions,
  permission: PermissionId,
): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) === true;
}
