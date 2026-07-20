import { cookies } from "next/headers";

import { type AccessTokenClaims, verifyAccessToken } from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/session";

/**
 * Resolves access-token claims for an API route handler: prefers an explicit
 * `Authorization: Bearer <token>` header (a caller with no browser cookie
 * jar), falling back to the `sh_access_token` cookie. Both are verified the
 * same way (HS256 signature + expiry) -- this does not attempt a refresh.
 * Cookie-based callers under `/api/admin/**` already had their expired
 * access token refreshed by `proxy.ts` before reaching here, so a `null`
 * here means the refresh token was also missing/expired/revoked (or the
 * caller used a Bearer token, which `proxy.ts` doesn't refresh) -- callers
 * that get `null` should just return 401.
 */
export async function resolveAccessClaims(
  request: Request,
): Promise<AccessTokenClaims | null> {
  const raw = request.headers.get("Authorization");
  const bearer = raw?.startsWith("Bearer ") ? raw.slice(7).trim() : "";
  if (bearer) {
    return verifyAccessToken(bearer);
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  return token ? verifyAccessToken(token) : null;
}
