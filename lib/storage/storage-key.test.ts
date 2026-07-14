import { describe, expect, it } from "vitest";

import {
  buildStorageFilename,
  randomKeySuffix,
  sanitizeForStorageKey,
} from "@/lib/storage/storage-key";

describe("sanitizeForStorageKey", () => {
  it("strips accents and replaces unsafe characters with underscores", () => {
    expect(sanitizeForStorageKey("Nguyễn Văn Á - CV (final).v2")).toBe(
      "Nguyen_Van_A_-_CV_final_.v2",
    );
  });

  it("collapses repeated separators and trims leading/trailing underscores or dots", () => {
    expect(sanitizeForStorageKey("  ..weird///name..  ")).toBe("weird_name");
  });

  it("falls back to a default label when nothing safe remains", () => {
    expect(sanitizeForStorageKey("   ")).toBe("file");
    expect(sanitizeForStorageKey("***")).toBe("file");
  });

  it("truncates very long labels", () => {
    const long = "a".repeat(200);
    expect(sanitizeForStorageKey(long).length).toBeLessThanOrEqual(80);
  });
});

describe("randomKeySuffix", () => {
  it("returns 8 lowercase hex characters", () => {
    expect(randomKeySuffix()).toMatch(/^[0-9a-f]{8}$/);
  });

  it("is different across calls", () => {
    expect(randomKeySuffix()).not.toBe(randomKeySuffix());
  });
});

describe("buildStorageFilename", () => {
  it("joins the sanitized label, a random suffix, and the extension", () => {
    const filename = buildStorageFilename("My Resume", ".pdf");
    expect(filename).toMatch(/^My_Resume_[0-9a-f]{8}\.pdf$/);
  });
});
