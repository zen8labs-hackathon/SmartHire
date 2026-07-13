import { createHash, randomBytes } from "node:crypto";

/**
 * Refresh token lifetime. Not a security-critical latency number like the
 * access token TTL (this token is revocable at any time via
 * `revokeAllRefreshTokensForUser`/`revokeRefreshTokenByHash`) -- 30 days is a
 * conventional "stay signed in" default, not a value confirmed with the user
 * during JW4T8X planning. Revisit if product wants a shorter/longer session.
 */
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

/** 256 bits of randomness, URL-safe -- suitable as a cookie value directly. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * SHA-256 of the raw token, stored/looked-up instead of the token itself so
 * a `refresh_tokens` row leak (DB dump, log line) can't be replayed as a
 * valid session -- same rationale as bcrypt for passwords, just a plain hash
 * here since the input already has 256 bits of entropy (no brute-force risk
 * a slow KDF would need to defend against).
 */
export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
