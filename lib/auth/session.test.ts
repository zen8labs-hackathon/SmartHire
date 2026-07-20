import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { verifyAccessToken } from "@/lib/auth/jwt";
import { hashPassword } from "@/lib/auth/password";
import { hashOpaqueToken } from "@/lib/auth/refresh-token";
import {
  ACCESS_TOKEN_COOKIE,
  buildAccessTokenCookie,
  buildClearedCookies,
  buildRefreshTokenCookie,
  login,
  logout,
  refreshSession,
  REFRESH_TOKEN_COOKIE,
} from "@/lib/auth/session";

const ORIGINAL_SECRET = process.env.AUTH_JWT_SECRET;
let passwordHash: string;

beforeAll(async () => {
  passwordHash = await hashPassword("correct-horse-battery-staple");
});

beforeEach(() => {
  process.env.AUTH_JWT_SECRET = "test-secret-do-not-use-in-prod";
});

afterEach(() => {
  process.env.AUTH_JWT_SECRET = ORIGINAL_SECRET;
});

function fakeDb(queuedRows: unknown[][]) {
  const query = vi.fn();
  for (const rows of queuedRows) {
    query.mockResolvedValueOnce({ rows });
  }
  return { query };
}

const USER_ROW = {
  id: "user-1",
  email: "hr@example.com",
  username: "hr",
  role: "hr" as const,
  password_hash: null as string | null,
  sso_provider: null,
  sso_subject_id: null,
  created_at: new Date(),
  deleted_at: null,
};

describe("login", () => {
  it("issues a session for correct credentials", async () => {
    const db = fakeDb([
      [{ ...USER_ROW, password_hash: passwordHash }],
      [{ id: "rt-1" }],
    ]);

    const result = await login(db, "hr@example.com", "correct-horse-battery-staple");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.session.user).not.toHaveProperty("password_hash");
    const claims = verifyAccessToken(result.session.accessToken);
    expect(claims?.sub).toBe("user-1");
    expect(claims?.role).toBe("hr");
    expect(result.session.refreshToken).toHaveLength(43); // 32 random bytes, base64url

    // second query is the refresh_tokens insert, keyed on the hash of the returned raw token
    const [, insertValues] = db.query.mock.calls[1];
    expect(insertValues[1]).toBe(hashOpaqueToken(result.session.refreshToken));
  });

  it("rejects a wrong password without a second query", async () => {
    const db = fakeDb([[{ ...USER_ROW, password_hash: passwordHash }]]);

    const result = await login(db, "hr@example.com", "wrong-password");

    expect(result).toEqual({ ok: false, error: "invalid_credentials" });
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("rejects an unknown email", async () => {
    const db = fakeDb([[]]);
    const result = await login(db, "nobody@example.com", "whatever");
    expect(result).toEqual({ ok: false, error: "invalid_credentials" });
  });

  it("rejects an SSO-only account (no password_hash) instead of throwing", async () => {
    const db = fakeDb([[{ ...USER_ROW, password_hash: null }]]);
    const result = await login(db, "hr@example.com", "anything");
    expect(result).toEqual({ ok: false, error: "invalid_credentials" });
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});

describe("logout", () => {
  it("revokes the refresh token by its hash", async () => {
    const db = fakeDb([[]]);
    await logout(db, "raw-refresh-token");
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("SET revoked_at = now()"),
      [hashOpaqueToken("raw-refresh-token")],
    );
  });

  it("no-ops when there is no refresh token", async () => {
    const db = fakeDb([]);
    await logout(db, undefined);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe("refreshSession", () => {
  it("rotates the token and mints a new access token from the current role", async () => {
    const db = fakeDb([
      [{ id: "rt-1", user_id: "user-1" }], // getActiveRefreshTokenByHash
      [], // revokeRefreshTokenByHash
      [{ ...USER_ROW, role: "admin", password_hash: passwordHash }], // getUserByIdForAuth (role changed since login)
      [{ id: "rt-2" }], // createRefreshToken
    ]);

    const result = await refreshSession(db, "old-refresh-token");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    const claims = verifyAccessToken(result.session.accessToken);
    expect(claims?.role).toBe("admin");
    expect(db.query).toHaveBeenCalledTimes(4);
  });

  it("rejects an invalid/expired/revoked refresh token", async () => {
    const db = fakeDb([[]]);
    const result = await refreshSession(db, "bad-token");
    expect(result).toEqual({ ok: false, error: "invalid_refresh_token" });
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("rejects when the user behind the token no longer exists", async () => {
    const db = fakeDb([
      [{ id: "rt-1", user_id: "user-1" }],
      [],
      [], // getUserByIdForAuth finds nothing (deleted)
    ]);
    const result = await refreshSession(db, "old-refresh-token");
    expect(result).toEqual({ ok: false, error: "user_not_found" });
  });
});

describe("cookie builders", () => {
  it("builds httpOnly access/refresh cookies with the expected names", () => {
    const access = buildAccessTokenCookie("access-token-value");
    const refresh = buildRefreshTokenCookie("refresh-token-value");

    expect(access.name).toBe(ACCESS_TOKEN_COOKIE);
    expect(access.httpOnly).toBe(true);
    expect(refresh.name).toBe(REFRESH_TOKEN_COOKIE);
    expect(refresh.maxAge).toBeGreaterThan(access.maxAge);
  });

  it("builds cleared cookies with maxAge 0", () => {
    const cleared = buildClearedCookies();
    expect(cleared).toHaveLength(2);
    expect(cleared.every((c) => c.maxAge === 0)).toBe(true);
  });
});
