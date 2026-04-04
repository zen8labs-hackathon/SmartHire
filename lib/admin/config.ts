import type { SupabaseClient } from "@supabase/supabase-js";

import { getStaffProfileAccess } from "@/lib/admin/profile-access";

export async function isProfileAdmin(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (error) return false;
  return data?.is_admin === true;
}

/** Recruiter app access: `work_chapter` set or legacy admin flag. */
export async function isProfileStaff(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const a = await getStaffProfileAccess(supabase, userId);
  return a?.isStaff === true;
}
