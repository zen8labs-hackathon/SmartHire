import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";

import { cvContentSha256Hex, cvFileSha256Hex } from "@/lib/candidates/cv-hash";

describe("cvFileSha256Hex", () => {
  it("matches a plain SHA-256 of the raw bytes", () => {
    const bytes = Buffer.from("hello world");
    const expected = createHash("sha256").update(bytes).digest("hex");

    expect(cvFileSha256Hex(bytes)).toBe(expected);
  });
});

describe("cvContentSha256Hex", () => {
  it("is stable across whitespace and case differences (matches client-side normalization)", () => {
    const a = cvContentSha256Hex("Hello   World\n\nFoo");
    const b = cvContentSha256Hex("hello world foo");

    expect(a).toBe(b);
  });

  it("differs for genuinely different content", () => {
    expect(cvContentSha256Hex("foo")).not.toBe(cvContentSha256Hex("bar"));
  });
});
