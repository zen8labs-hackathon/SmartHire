import { describe, expect, it } from "vitest";

import { categorizeSkill, groupSkillsForDisplay } from "./group-skills-for-display";

describe("categorizeSkill", () => {
  it("classifies common stacks", () => {
    expect(categorizeSkill("TypeScript")).toBe("languages");
    expect(categorizeSkill("Python")).toBe("languages");
    expect(categorizeSkill("React")).toBe("frameworks");
    expect(categorizeSkill("Docker")).toBe("tools");
    expect(categorizeSkill("AWS")).toBe("tools");
  });

  it("does not treat Java as substring of JavaScript", () => {
    expect(categorizeSkill("JavaScript")).toBe("languages");
    expect(categorizeSkill("Java")).toBe("languages");
  });

  it("splits composite labels", () => {
    expect(categorizeSkill("React / Redux")).toBe("frameworks");
    expect(categorizeSkill("Python, Django")).toBe("languages");
  });
});

describe("groupSkillsForDisplay", () => {
  it("dedupes case-insensitively and orders by bucket then first-seen within bucket", () => {
    const sections = groupSkillsForDisplay([
      "React",
      "react",
      "TypeScript",
      "Docker",
      "UnknownThing",
    ]);
    const labels = sections.map((s) => s.id);
    expect(labels).toEqual(["languages", "frameworks", "tools", "other"]);
    const flat = sections.flatMap((s) => s.skills);
    expect(flat).toEqual(["TypeScript", "React", "Docker", "UnknownThing"]);
  });
});
