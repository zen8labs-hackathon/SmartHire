import { describe, expect, it } from "vitest";

import { generateOpaqueToken, hashOpaqueToken } from "@/lib/auth/refresh-token";

describe("generateOpaqueToken", () => {
  it("generates distinct, sufficiently long tokens", () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });
});

describe("hashOpaqueToken", () => {
  it("is deterministic for the same input", () => {
    const token = generateOpaqueToken();
    expect(hashOpaqueToken(token)).toBe(hashOpaqueToken(token));
  });

  it("produces a hex sha-256 digest distinct from the input", () => {
    const token = generateOpaqueToken();
    const hash = hashOpaqueToken(token);
    expect(hash).not.toBe(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
