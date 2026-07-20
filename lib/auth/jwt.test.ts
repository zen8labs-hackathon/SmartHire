import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ACCESS_TOKEN_TTL_SECONDS, signAccessToken, verifyAccessToken } from "@/lib/auth/jwt";

const ORIGINAL_SECRET = process.env.AUTH_JWT_SECRET;

beforeEach(() => {
  process.env.AUTH_JWT_SECRET = "test-secret-do-not-use-in-prod";
});

afterEach(() => {
  process.env.AUTH_JWT_SECRET = ORIGINAL_SECRET;
  vi.useRealTimers();
});

describe("signAccessToken / verifyAccessToken", () => {
  it("round-trips a valid token", () => {
    const token = signAccessToken({ sub: "user-1", role: "hr" });
    const claims = verifyAccessToken(token);

    expect(claims).not.toBeNull();
    expect(claims?.sub).toBe("user-1");
    expect(claims?.role).toBe("hr");
    expect(claims!.exp - claims!.iat).toBe(ACCESS_TOKEN_TTL_SECONDS);
  });

  it("produces a 3-part dot-separated token", () => {
    const token = signAccessToken({ sub: "user-1", role: "none" });
    expect(token.split(".")).toHaveLength(3);
  });

  it("rejects a token with a tampered payload", () => {
    const token = signAccessToken({ sub: "user-1", role: "recruiter" });
    const [header, payload, signature] = token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({
        sub: "user-1",
        role: "admin",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 900,
      }),
    ).toString("base64url");
    const forged = `${header}.${forgedPayload}.${signature}`;

    expect(verifyAccessToken(forged)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = signAccessToken({ sub: "user-1", role: "hr" });
    process.env.AUTH_JWT_SECRET = "a-different-secret";
    expect(verifyAccessToken(token)).toBeNull();
  });

  it("rejects an expired token", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const token = signAccessToken({ sub: "user-1", role: "hr" });

    vi.setSystemTime(new Date("2026-01-01T00:16:00Z"));
    expect(verifyAccessToken(token)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifyAccessToken("not-a-jwt")).toBeNull();
    expect(verifyAccessToken("a.b")).toBeNull();
    expect(verifyAccessToken("")).toBeNull();
  });

  it("verifyAccessToken returns null (fails closed) when the signing secret is missing", () => {
    const token = signAccessToken({ sub: "user-1", role: "hr" });
    delete process.env.AUTH_JWT_SECRET;
    expect(verifyAccessToken(token)).toBeNull();
  });

  it("signAccessToken throws when the signing secret is missing", () => {
    delete process.env.AUTH_JWT_SECRET;
    expect(() => signAccessToken({ sub: "user-1", role: "hr" })).toThrow(
      /AUTH_JWT_SECRET/,
    );
  });

  it("honors a custom ttlSeconds", () => {
    const token = signAccessToken({ sub: "user-1", role: "hr" }, 60);
    const claims = verifyAccessToken(token);
    expect(claims!.exp - claims!.iat).toBe(60);
  });
});
