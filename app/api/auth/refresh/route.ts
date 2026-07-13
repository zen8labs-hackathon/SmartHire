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
 * Client-triggered refresh for `/api/admin/**` calls: those routes aren't
 * covered by `proxy.ts` (matcher only covers page routes, matching this
 * repo's existing pattern -- see `lib/admin/require-*`), so a caller whose
 * access-token cookie has expired hits this once and retries its original
 * request. `proxy.ts` does its own inline refresh for page navigations and
 * does not call this route.
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
