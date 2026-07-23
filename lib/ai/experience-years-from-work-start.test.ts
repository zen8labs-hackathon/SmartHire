import { describe, expect, it } from "vitest";

import { experienceYearsFromWorkStart } from "@/lib/ai/experience-years-from-work-start";

describe("experienceYearsFromWorkStart", () => {
  const now = new Date(2026, 6, 23); // 2026-07-23

  it("returns null for missing or blank input", () => {
    expect(experienceYearsFromWorkStart(null, now)).toBeNull();
    expect(experienceYearsFromWorkStart(undefined, now)).toBeNull();
    expect(experienceYearsFromWorkStart("  ", now)).toBeNull();
  });

  it("computes years from YYYY start (Jan 1 of that year)", () => {
    // 2020-01-01 → 2026-07-23 ≈ 6.6 years
    expect(experienceYearsFromWorkStart("2020", now)).toBe(6.6);
  });

  it("computes years from YYYY-MM start", () => {
    // 2020-07-01 → 2026-07-23 ≈ 6.1 years
    expect(experienceYearsFromWorkStart("2020-07", now)).toBe(6.1);
  });

  it("computes years from YYYY-MM-DD start", () => {
    expect(experienceYearsFromWorkStart("2021-07-23", now)).toBe(5);
  });

  it("returns null for future dates and unparseable strings", () => {
    expect(experienceYearsFromWorkStart("2099-01", now)).toBeNull();
    expect(experienceYearsFromWorkStart("July 2020", now)).toBeNull();
    expect(experienceYearsFromWorkStart("2020-13", now)).toBeNull();
  });
});
