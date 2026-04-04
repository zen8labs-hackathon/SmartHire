import type { SupabaseClient } from "@supabase/supabase-js";

/** Canonical chapter value for full (HR) access. */
export const HR_WORK_CHAPTER = "HR";

export type StaffProfileAccess = {
  userId: string;
  isAdmin: boolean;
  workChapter: string | null;
  /** Chapter memberships (recruiter scope); empty for HR-only or dashboard-only. */
  chapterIds: string[];
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

  const { data: pcRows } = await supabase
    .from("profile_chapters")
    .select("chapter_id")
    .eq("profile_id", userId);

  const chapterIds = (pcRows ?? [])
    .map((r) => r.chapter_id as string)
    .filter((id) => typeof id === "string" && id.length > 0);

  const isStaff =
    isAdmin || workChapter != null || chapterIds.length > 0;
  const isHr = isAdmin || workChapter === HR_WORK_CHAPTER;

  return { userId, isAdmin, workChapter, chapterIds, isHr, isStaff };
}

export async function isProfileStaff(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const a = await getStaffProfileAccess(supabase, userId);
  return a?.isStaff === true;
}
