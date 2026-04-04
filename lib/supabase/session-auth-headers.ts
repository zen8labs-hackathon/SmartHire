import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Headers for authenticated API calls from the browser. Uses getSession() so the
 * SSR/middleware-managed cookie session stays the single source of truth (do not
 * call refreshSession() from the browser client).
 */
export async function getSessionAuthorizationHeaders(
  supabase: SupabaseClient,
): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const h: Record<string, string> = {};
  if (session?.access_token) {
    h.Authorization = `Bearer ${session.access_token}`;
  }
  return h;
}
