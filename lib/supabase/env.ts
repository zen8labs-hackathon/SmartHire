/**
 * Returns the API key for Supabase clients.
 *
 * Prefers the legacy JWT `NEXT_PUBLIC_SUPABASE_ANON_KEY` because PostgREST
 * and @supabase/ssr session management require a JWT-format key for RLS
 * (`auth.uid()`) to work correctly in the browser.
 *
 * Falls back to `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (sb_publishable_...)
 * for new projects that only have the new key format.
 */
export function getSupabasePublishableKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}
