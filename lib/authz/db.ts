import type { QueryExecutor } from "@/lib/db/config/client";
import type { PermissionId } from "@/lib/authz/permissions";
import type { ProfileRole } from "@/lib/db/users";

export type PermissionRow = {
  id: string;
  description: string;
};

export async function listPermissions(
  db: QueryExecutor,
): Promise<PermissionRow[]> {
  const { rows } = await db.query<PermissionRow>(
    `SELECT id, description FROM permissions ORDER BY id`,
  );
  return rows;
}

export async function listPermissionIdsForRole(
  db: QueryExecutor,
  role: ProfileRole,
): Promise<PermissionId[]> {
  const { rows } = await db.query<{ permission_id: string }>(
    `SELECT permission_id FROM role_permissions WHERE role = $1`,
    [role],
  );
  return rows.map((r) => r.permission_id as PermissionId);
}

export async function listGroupPermissionIds(
  db: QueryExecutor,
  chapterId: string,
): Promise<PermissionId[]> {
  const { rows } = await db.query<{ permission_id: string }>(
    `SELECT permission_id FROM group_permissions WHERE chapter_id = $1`,
    [chapterId],
  );
  return rows.map((r) => r.permission_id as PermissionId);
}
