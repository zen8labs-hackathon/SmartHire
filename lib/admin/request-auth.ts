import { cache } from "react";
import type { User } from "@supabase/supabase-js";

import { getStaffProfileAccess, type StaffProfileAccess } from "./profile-access";
import { createClient } from "@/lib/supabase/server";

export type RequestAuth = {
  user: User | null;
  access: StaffProfileAccess | null;
};

/**
 * Resolves the current request's authenticated user + staff/HR access level,
 * memoized once per React render pass via React's `cache()` (see
 * node_modules/next/dist/docs/01-app/02-guides/authentication.md, "Creating a
 * Data Access Layer (DAL)" — this repo's own vendored docs recommend exactly
 * this pattern for a `verifySession()`/`getUser()`-style helper).
 *
 * Before this helper existed, `app/admin/layout.tsx` and every nested
 * `app/admin/**\/page.tsx` each independently called
 * `supabase.auth.getUser()` — a real network round-trip that revalidates the
 * JWT against the Supabase Auth server — resulting in 2 identical calls per
 * `/admin/*` navigation (one from the layout, one from the page) on top of
 * the one `middleware.ts` already does. Calling `getRequestAuth()` from both
 * the layout and the page now dedupes those 2 calls down to 1: React's
 * `cache()` returns the same in-flight/resolved promise to every caller
 * within the same request, so the underlying `getUser()` (and
 * `getStaffProfileAccess()`) work still actually executes and still
 * genuinely revalidates the JWT — this does NOT skip or weaken verification,
 * it only removes *duplicate* identical calls within a single request.
 * `middleware.ts` runs in a separate Edge/Node process per request and is
 * NOT covered by this memoization (React's request cache doesn't cross that
 * boundary) — its own `getUser()` call remains a deliberate, separate
 * revalidation, exactly as before.
 *
 * Callers that also need a `supabase` client for their own data queries
 * should still call `createClient()` themselves — this helper intentionally
 * only dedupes the auth *check*, not Supabase client construction (which is
 * cheap and has no network cost on its own).
 */
export const getRequestAuth = cache(async (): Promise<RequestAuth> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, access: null };

  const access = await getStaffProfileAccess(supabase, user.id, user);
  return { user, access };
});
