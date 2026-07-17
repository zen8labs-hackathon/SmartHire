import { describe, expect, it } from "vitest";

import {
  MAX_SKILLS,
  candidateProfilePatchSchema,
  diffProfileSnapshotsToPatch,
  mergeProfileIntoParsedPayload,
} from "./candidate-profile-patch";

describe("mergeProfileIntoParsedPayload", () => {
  it("merges over existing object and preserves unrelated keys", () => {
    const merged = mergeProfileIntoParsedPayload(
      {
        name: "Old",
        email: "a@b.com",
        experienceSummary: "Built things",
      },
      { name: "New", role: "Eng", skills: ["Go"] },
    );
    expect(merged.name).toBe("New");
    expect(merged.role).toBe("Eng");
    expect(merged.skills).toEqual(["Go"]);
    expect(merged.email).toBe("a@b.com");
    expect(merged.experienceSummary).toBe("Built things");
  });

  it("starts fresh when payload is not an object", () => {
    const merged = mergeProfileIntoParsedPayload(null, {
      name: "X",
      experienceYears: 3,
    });
    expect(merged).toEqual({ name: "X", experienceYears: 3 });
  });
});

describe("candidateProfilePatchSchema", () => {
  it("rejects empty body", () => {
    const r = candidateProfilePatchSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it("accepts a single-field patch", () => {
    const r = candidateProfilePatchSchema.safeParse({ name: "Ada" });
    expect(r.success).toBe(true);
  });

  it("rejects more than MAX_SKILLS skill tokens", () => {
    const many = Array.from({ length: MAX_SKILLS + 1 }, (_, i) => `Skill${i}`);
    const r = candidateProfilePatchSchema.safeParse({ skills: many });
    expect(r.success).toBe(false);
  });

  it("dedupes skills case-insensitively", () => {
    const r = candidateProfilePatchSchema.safeParse({
      skills: ["Go", " go ", "Rust", "rust"],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.skills).toEqual(["Go", "Rust"]);
    }
  });
});

describe("diffProfileSnapshotsToPatch", () => {
  const base = {
    name: "A",
    role: "Dev",
    experienceYears: 2,
    skills: ["a", "b"],
    degree: "BS",
    school: "U",
    source: "LinkedIn" as const,
    sourceOther: "",
    email: "a@a.com",
    phone: "1",
    gpa: "3.5",
    englishLevel: "IELTS 6.5",
    dateOfBirth: "2000-01-01",
    studentYears: "K65",
    expectedSalary: "15-20M",
  };

  it("returns null when nothing changed", () => {
    expect(diffProfileSnapshotsToPatch(base, base)).toBeNull();
  });

  it("detects name and clears to null when emptied", () => {
    const p = diffProfileSnapshotsToPatch(
      { ...base, name: "  " },
      base,
    );
    expect(p).toEqual({ name: null });
  });

  it("includes source_other when switching to Other", () => {
    const p = diffProfileSnapshotsToPatch(
      { ...base, source: "Other", sourceOther: "Fair" },
      base,
    );
    expect(p).toEqual({
      source: "Other",
      source_other: "Fair",
    });
  });
});
