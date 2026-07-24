import { describe, expect, it } from "vitest";

import { explicitExperienceYearsFromText } from "@/lib/ai/explicit-experience-years-from-text";

describe("explicitExperienceYearsFromText", () => {
  it("finds common English phrases", () => {
    expect(
      explicitExperienceYearsFromText(
        "iOS Developer with 5 years of professional experience.",
      ),
    ).toBe(5);
    expect(
      explicitExperienceYearsFromText("Experience: 3+ years in mobile."),
    ).toBe(3);
  });

  it("finds Vietnamese phrases", () => {
    expect(
      explicitExperienceYearsFromText("Có 4 năm kinh nghiệm iOS."),
    ).toBe(4);
    expect(
      explicitExperienceYearsFromText("Kinh nghiệm: 2 năm"),
    ).toBe(2);
  });

  it("returns null when no explicit years phrase exists", () => {
    const cv = `
      Dec 2022 - Mar 2023 Tozi media Intern
      Mar 2023 - Now BHSoft Mobile Engineer
      Team size 6
      OBJECTIVE To improve knowledge, experience and working skill.
    `;
    expect(explicitExperienceYearsFromText(cv)).toBeNull();
  });
});
