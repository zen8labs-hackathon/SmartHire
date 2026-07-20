import { createHmac, timingSafeEqual } from "node:crypto";

import type { ProfileRole } from "@/lib/db/users";

/**
 * Access token lifetime. This number *is* the maximum revoke-latency: an
 * admin disabling a user's access takes effect once their refresh token is
 * revoked, but any access JWT already issued keeps verifying (signature-only,
 * no DB hit) until it expires on its own. Decided with the user 2026-07-13
 * (JW4T8X) as the balance point between that latency and how often a client
 * has to silently refresh.
 */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export type AccessTokenClaims = {
  sub: string;
  role: ProfileRole;
  iat: number;
  exp: number;
};

const VALID_ROLES = new Set<ProfileRole>(["admin", "hr", "recruiter", "none"]);

function getSecret(): string {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret) {
    throw new Error(
      "Missing AUTH_JWT_SECRET environment variable (required to sign/verify access tokens)",
    );
  }
  return secret;
}

function base64url(input: Buffer): string {
  return input.toString("base64url");
}

function hmac(signingInput: string, secret: string): string {
  return base64url(createHmac("sha256", secret).update(signingInput).digest());
}

/**
 * Signs a short-lived HS256 access JWT. HMAC (symmetric secret) was chosen
 * over RS256 -- nothing outside this app verifies these tokens today, so an
 * asymmetric keypair would add operational complexity with no benefit (see
 * JW4T8X planning doc).
 */
export function signAccessToken(
  payload: { sub: string; role: ProfileRole },
  ttlSeconds: number = ACCESS_TOKEN_TTL_SECONDS,
): string {
  const secret = getSecret();
  const now = Math.floor(Date.now() / 1000);
  const claims: AccessTokenClaims = {
    sub: payload.sub,
    role: payload.role,
    iat: now,
    exp: now + ttlSeconds,
  };

  const encodedHeader = base64url(
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  );
  const encodedPayload = base64url(Buffer.from(JSON.stringify(claims)));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  return `${signingInput}.${hmac(signingInput, secret)}`;
}

/**
 * Verifies signature + expiry and returns the claims, or `null` for any
 * failure (malformed token, bad signature, expired, missing signing secret).
 * Callers treat `null` as "not authenticated" -- this never throws, so a
 * misconfigured/missing `AUTH_JWT_SECRET` fails closed (blocks access)
 * instead of silently letting requests through.
 */
export function verifyAccessToken(token: string): AccessTokenClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, signature] = parts;

  let secret: string;
  try {
    secret = getSecret();
  } catch {
    return null;
  }

  let expected: Buffer;
  let provided: Buffer;
  try {
    expected = Buffer.from(
      hmac(`${encodedHeader}.${encodedPayload}`, secret),
      "base64url",
    );
    provided = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (
    expected.length !== provided.length ||
    !timingSafeEqual(expected, provided)
  ) {
    return null;
  }

  let claims: AccessTokenClaims;
  try {
    claims = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );
  } catch {
    return null;
  }

  if (
    typeof claims.sub !== "string" ||
    typeof claims.role !== "string" ||
    !VALID_ROLES.has(claims.role) ||
    typeof claims.exp !== "number"
  ) {
    return null;
  }
  if (claims.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  return claims;
}
