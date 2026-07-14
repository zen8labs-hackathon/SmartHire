import type { QueryExecutor } from "@/lib/db/config/client";
import {
  createRefreshToken,
  getActiveRefreshTokenByHash,
  revokeRefreshTokenByHash,
} from "@/lib/db/refresh-tokens";
import {
  getUserByEmailForAuth,
  getUserByIdForAuth,
  type PublicUserRow,
} from "@/lib/db/users";
import { ACCESS_TOKEN_TTL_SECONDS, signAccessToken } from "@/lib/auth/jwt";
import { verifyPassword } from "@/lib/auth/password";
import {
  generateOpaqueToken,
  hashOpaqueToken,
  REFRESH_TOKEN_TTL_SECONDS,
} from "@/lib/auth/refresh-token";

export const ACCESS_TOKEN_COOKIE = "sh_access_token";
export const REFRESH_TOKEN_COOKIE = "sh_refresh_token";

export type SessionCookie = {
  name: string;
  value: string;
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
};

/**
 * Cookies are `Secure` by default in production. Browsers silently refuse to
 * store a `Secure` cookie over a plain-HTTP connection (the `localhost`
 * exception aside), so a deployment served without TLS in front of it (e.g.
 * a bare cloud VM IP with no reverse proxy/cert yet) would otherwise never
 * persist the session -- login appears to work (the redirect renders from
 * the same response) but the very next request has no cookie and bounces to
 * `/login`. `COOKIE_SECURE=false` is an explicit, temporary opt-out for that
 * case; the real fix for such a deployment is to put TLS in front of it.
 */
function isSecureCookieEnv(): boolean {
  if (process.env.COOKIE_SECURE === "false") return false;
  if (process.env.COOKIE_SECURE === "true") return true;
  return process.env.NODE_ENV === "production";
}

function cookieOptions() {
  return {
    httpOnly: true as const,
    secure: isSecureCookieEnv(),
    sameSite: "lax" as const,
    path: "/" as const,
  };
}

export function buildAccessTokenCookie(token: string): SessionCookie {
  return {
    name: ACCESS_TOKEN_COOKIE,
    value: token,
    maxAge: ACCESS_TOKEN_TTL_SECONDS,
    ...cookieOptions(),
  };
}

export function buildRefreshTokenCookie(token: string): SessionCookie {
  return {
    name: REFRESH_TOKEN_COOKIE,
    value: token,
    maxAge: REFRESH_TOKEN_TTL_SECONDS,
    ...cookieOptions(),
  };
}

/** `maxAge: 0` clears the cookie regardless of the value passed. */
export function buildClearedCookies(): SessionCookie[] {
  return [
    { name: ACCESS_TOKEN_COOKIE, value: "", maxAge: 0, ...cookieOptions() },
    { name: REFRESH_TOKEN_COOKIE, value: "", maxAge: 0, ...cookieOptions() },
  ];
}

export type SessionTokens = {
  accessToken: string;
  refreshToken: string;
  user: PublicUserRow;
};

export type SessionMeta = { userAgent?: string | null; ip?: string | null };

async function issueSession(
  db: QueryExecutor,
  user: PublicUserRow,
  meta: SessionMeta = {},
): Promise<SessionTokens> {
  const accessToken = signAccessToken({ sub: user.id, role: user.role });
  const refreshToken = generateOpaqueToken();
  await createRefreshToken(db, {
    userId: user.id,
    tokenHash: hashOpaqueToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    userAgent: meta.userAgent ?? null,
    ip: meta.ip ?? null,
  });
  return { accessToken, refreshToken, user };
}

export type LoginResult =
  | { ok: true; session: SessionTokens }
  | { ok: false; error: "invalid_credentials" };

/**
 * Verifies email/password and issues a new access+refresh session.
 * Returns the same generic `invalid_credentials` error whether the account
 * doesn't exist, the password is wrong, or the account has no password
 * (SSO-only, once AZ4S9K lands) -- distinguishing those to the caller would
 * leak account existence/type to an attacker.
 */
export async function login(
  db: QueryExecutor,
  email: string,
  password: string,
  meta: SessionMeta = {},
): Promise<LoginResult> {
  const user = await getUserByEmailForAuth(db, email);
  if (!user || !user.password_hash) {
    return { ok: false, error: "invalid_credentials" };
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return { ok: false, error: "invalid_credentials" };
  }

  const {
    password_hash: _password_hash,
    sso_provider: _sso_provider,
    sso_subject_id: _sso_subject_id,
    ...publicUser
  } = user;
  const session = await issueSession(db, publicUser, meta);
  return { ok: true, session };
}

export async function logout(
  db: QueryExecutor,
  refreshToken: string | undefined,
): Promise<void> {
  if (!refreshToken) return;
  await revokeRefreshTokenByHash(db, hashOpaqueToken(refreshToken));
}

export type RefreshResult =
  | { ok: true; session: SessionTokens }
  | { ok: false; error: "invalid_refresh_token" | "user_not_found" };

/**
 * Rotates a refresh token: the presented token is revoked (single-use) and
 * replaced with a new one, and a new access token is minted from the user's
 * *current* role (re-read from the DB, not cached from the old access token)
 * so a role change takes effect on the next refresh rather than being stuck
 * until the old refresh token's own expiry.
 */
export async function refreshSession(
  db: QueryExecutor,
  refreshToken: string,
  meta: SessionMeta = {},
): Promise<RefreshResult> {
  const tokenHash = hashOpaqueToken(refreshToken);
  const existing = await getActiveRefreshTokenByHash(db, tokenHash);
  if (!existing) {
    return { ok: false, error: "invalid_refresh_token" };
  }

  await revokeRefreshTokenByHash(db, tokenHash);

  const user = await getUserByIdForAuth(db, existing.user_id);
  if (!user) {
    return { ok: false, error: "user_not_found" };
  }

  const {
    password_hash: _password_hash,
    sso_provider: _sso_provider,
    sso_subject_id: _sso_subject_id,
    ...publicUser
  } = user;
  const session = await issueSession(db, publicUser, meta);
  return { ok: true, session };
}
