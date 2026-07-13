import type { QueryExecutor } from "@/lib/db/config/client";
import { getStaffProfileAccess } from "@/lib/admin/profile-access";

export async function isProfileAdmin(
  db: QueryExecutor,
  userId: string,
): Promise<boolean> {
  const access = await getStaffProfileAccess(db, userId);
  return access?.isAdmin === true;
}
