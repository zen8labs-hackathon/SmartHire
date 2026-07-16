import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchGraphProfile,
  generatePkcePair,
  generateState,
} from "./azure";

beforeEach(() => {
  process.env.AZURE_AD_CLIENT_ID = "test-client-id";
  process.env.AZURE_AD_CLIENT_SECRET = "test-client-secret";
  process.env.AZURE_AD_TENANT_ID = "test-tenant-id";
  process.env.AZURE_AD_REDIRECT_URI = "http://localhost:3000/api/auth/azure/callback";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.AZURE_AD_CLIENT_ID;
  delete process.env.AZURE_AD_CLIENT_SECRET;
  delete process.env.AZURE_AD_TENANT_ID;
  delete process.env.AZURE_AD_REDIRECT_URI;
});

describe("generateState", () => {
  it("returns distinct base64url values", () => {
    const a = generateState();
    const b = generateState();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("generatePkcePair", () => {
  it("challenge is the base64url SHA-256 of the verifier", () => {
    const { codeVerifier, codeChallenge } = generatePkcePair();
    const expected = createHash("sha256").update(codeVerifier).digest("base64url");
    expect(codeChallenge).toBe(expected);
  });
});

describe("buildAuthorizeUrl", () => {
  it("includes the expected query params", () => {
    const url = new URL(
      buildAuthorizeUrl({ state: "s1", codeChallenge: "c1" }),
    );
    expect(url.origin + url.pathname).toBe(
      "https://login.microsoftonline.com/test-tenant-id/oauth2/v2.0/authorize",
    );
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/auth/azure/callback",
    );
    expect(url.searchParams.get("state")).toBe("s1");
    expect(url.searchParams.get("code_challenge")).toBe("c1");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });
});

describe("exchangeCodeForToken", () => {
  it("returns the access token on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: "abc123" }),
      }),
    );
    const result = await exchangeCodeForToken({ code: "code1", codeVerifier: "v1" });
    expect(result).toEqual({ ok: true, accessToken: "abc123" });
  });

  it("returns an error on a non-200 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 400 }),
    );
    const result = await exchangeCodeForToken({ code: "code1", codeVerifier: "v1" });
    expect(result.ok).toBe(false);
  });

  it("returns an error when access_token is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );
    const result = await exchangeCodeForToken({ code: "code1", codeVerifier: "v1" });
    expect(result.ok).toBe(false);
  });
});

describe("fetchGraphProfile", () => {
  it("maps id/mail to subjectId/email", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "obj-1", mail: "a@b.com" }),
      }),
    );
    const profile = await fetchGraphProfile("token");
    expect(profile).toEqual({ subjectId: "obj-1", email: "a@b.com" });
  });

  it("falls back to userPrincipalName when mail is null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "obj-1", mail: null, userPrincipalName: "a@b.com" }),
      }),
    );
    const profile = await fetchGraphProfile("token");
    expect(profile).toEqual({ subjectId: "obj-1", email: "a@b.com" });
  });

  it("returns null on a non-200 response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const profile = await fetchGraphProfile("token");
    expect(profile).toBeNull();
  });
});
