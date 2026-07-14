import { cookies } from "next/headers";

import { getRequestMeta } from "@/lib/auth/request-meta";
import {
  buildAccessTokenCookie,
  buildClearedCookies,
  buildRefreshTokenCookie,
  refreshSession,
  REFRESH_TOKEN_COOKIE,
} from "@/lib/auth/session";
import { getPool } from "@/lib/db/config/client";

/**
 * Manual refresh fallback. `proxy.ts` now runs the same inline
 * refresh-on-expiry logic for `/api/admin/**` as it does for page
 * navigations (both go through `resolveUser()`), so a cookie-based caller's
 * expired access token is transparently refreshed before the request ever
 * reaches a route handler -- this endpoint is not on that path. It remains
 * for callers that need an explicit refresh outside of a request the
 * middleware would otherwise intercept (e.g. proactively refreshing before
 * the access token expires, rather than reacting to a 401).
 */
export async function POST() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

  if (!refreshToken) {
    return Response.json({ error: "No refresh token." }, { status: 401 });
  }

  const meta = await getRequestMeta();
  const result = await refreshSession(getPool(), refreshToken, meta);

  if (!result.ok) {
    for (const cookie of buildClearedCookies()) {
      cookieStore.set(cookie);
    }
    return Response.json({ error: result.error }, { status: 401 });
  }

  cookieStore.set(buildAccessTokenCookie(result.session.accessToken));
  cookieStore.set(buildRefreshTokenCookie(result.session.refreshToken));

  return Response.json({ ok: true });
}
