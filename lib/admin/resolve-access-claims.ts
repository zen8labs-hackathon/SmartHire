import { cookies } from "next/headers";

import { type AccessTokenClaims, verifyAccessToken } from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/session";

/**
 * Resolves access-token claims for an API route handler: prefers an explicit
 * `Authorization: Bearer <token>` header (a caller with no browser cookie
 * jar), falling back to the `sh_access_token` cookie. Both are verified the
 * same way (HS256 signature + expiry) -- this does not attempt a refresh;
 * callers that get `null` should return 401 and let the client hit
 * `/api/auth/refresh` before retrying, matching how `require-*-request.ts`
 * behaved with Supabase (no auto-refresh at the API-auth layer either).
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
