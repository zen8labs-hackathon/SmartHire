import type { SupabaseClient } from "@supabase/supabase-js";

/** Canonical chapter value for full (HR) access. */
export const HR_WORK_CHAPTER = "HR";

export type StaffProfileAccess = {
  userId: string;
  isAdmin: boolean;
  workChapter: string | null;
  /** Superuser for RBAC: DB admin or HR chapter. */
  isHr: boolean;
  /** May use /admin app (recruiter or HR). */
  isStaff: boolean;
};

export async function getStaffProfileAccess(
  supabase: SupabaseClient,
  userId: string,
): Promise<StaffProfileAccess | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("is_admin, work_chapter")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;

  const isAdmin = data.is_admin === true;
  const raw = data.work_chapter as string | null;
  const workChapter =
    typeof raw === "string" && raw.trim() ? raw.trim() : null;

  const isStaff = isAdmin || workChapter != null;
  const isHr = isAdmin || workChapter === HR_WORK_CHAPTER;

  return { userId, isAdmin, workChapter, isHr, isStaff };
}

export async function isProfileStaff(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const a = await getStaffProfileAccess(supabase, userId);
  return a?.isStaff === true;
}
