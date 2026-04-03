import type { SupabaseClient } from "@supabase/supabase-js";

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
