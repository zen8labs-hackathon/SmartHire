import { describe, expect, it } from "vitest";

import { experienceYearsFromWorkPeriods } from "@/lib/ai/experience-years-from-work-periods";

describe("experienceYearsFromWorkPeriods", () => {
  const startOf2021 = new Date(2021, 0, 1);

  it("returns null for missing or unusable periods", () => {
    expect(experienceYearsFromWorkPeriods(null, startOf2021)).toBeNull();
    expect(experienceYearsFromWorkPeriods([], startOf2021)).toBeNull();
    expect(
      experienceYearsFromWorkPeriods(
        [{ start: "July 2020", end: "2020-12" }],
        startOf2021,
      ),
    ).toBeNull();
  });

  it("merges overlapping jobs in the same year into one calendar year", () => {
    // Jan–Jun and May–Dec 2020 cover Jan–Dec, not 14 months.
    expect(
      experienceYearsFromWorkPeriods(
        [
          { start: "2020-01", end: "2020-06" },
          { start: "2020-05", end: "2020-12" },
        ],
        startOf2021,
      ),
    ).toBe(1);
  });

  it("does not count a gap between jobs", () => {
    const now = new Date(2026, 7, 14); // 2026-08-14
    // 3 months in 2020 + work from 2022-01 through now, not 2020→now.
    const years = experienceYearsFromWorkPeriods(
      [
        { start: "2020-01", end: "2020-03" },
        { start: "2022-01", end: null },
      ],
      now,
    );
    expect(years).toBe(4.9);
  });

  it("does not keep counting after the last job ended", () => {
    expect(
      experienceYearsFromWorkPeriods(
        [{ start: "2020-01", end: "2020-12" }],
        new Date(2026, 7, 14),
      ),
    ).toBe(1);
  });

  it("treats a null end as still employed through now", () => {
    expect(
      experienceYearsFromWorkPeriods(
        [{ start: "2025-01", end: null }],
        new Date(2026, 0, 1),
      ),
    ).toBe(1);
  });
});
