import { cache } from "react";
import { cookies } from "next/headers";

import {
  getStaffProfileAccess,
  type StaffProfileAccess,
} from "./profile-access";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/session";
import { getPool } from "@/lib/db/config/client";

export type RequestAuthUser = { id: string; email: string };

export type RequestAuth = {
  user: RequestAuthUser | null;
  access: StaffProfileAccess | null;
};

/**
 * Resolves the current request's authenticated user + staff/HR access level,
 * memoized once per React render pass via React's `cache()` (see
 * node_modules/next/dist/docs/01-app/02-guides/authentication.md, "Creating a
 * Data Access Layer (DAL)"). Verifies the access-token cookie's signature and
 * expiry only (no DB hit for that part, no refresh attempt) -- `proxy.ts`
 * already refreshed an expired access token before this ever runs for a page
 * request, so a `null` claims result here means genuinely unauthenticated,
 * not "needs a refresh".
 *
 * Before this helper existed, `app/admin/layout.tsx` and every nested
 * `app/admin/**\/page.tsx` each independently resolved the session -- calling
 * `getRequestAuth()` from both dedupes that down to one resolution per
 * request via React's request cache.
 */
export const getRequestAuth = cache(async (): Promise<RequestAuth> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const claims = token ? verifyAccessToken(token) : null;

  if (!claims) return { user: null, access: null };

  const access = await getStaffProfileAccess(getPool(), claims.sub);
  if (!access) return { user: null, access: null };

  return { user: { id: access.userId, email: access.email }, access };
});
