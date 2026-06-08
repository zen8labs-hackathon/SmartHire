import { describe, expect, it } from "vitest";

import {
  isGroundedInDocument,
  pickHeaderField,
  pickLongFormField,
} from "@/lib/ai/jd-extract-merge";

const DOC = `
Position: AI ENGINEER (Mid-level)
Department: Solutions Team
Status: Fulltime

KEY RESPONSIBILITIES
- Build ML pipelines
- Collaborate with product team

Must have
- 3+ years Python
- TensorFlow experience
`.trim();

describe("isGroundedInDocument", () => {
  it("accepts text that appears in the source", () => {
    expect(isGroundedInDocument("AI ENGINEER (Mid-level)", DOC)).toBe(true);
  });

  it("rejects hallucinated titles", () => {
    expect(isGroundedInDocument("Software Engineer", DOC)).toBe(false);
  });
});

describe("pickHeaderField", () => {
  it("prefers deterministic header parse over AI", () => {
    expect(
      pickHeaderField(
        "AI ENGINEER (Mid-level)",
        "Software Engineer",
        DOC,
        50,
      ),
    ).toBe("AI ENGINEER (Mid-level)");
  });

  it("uses grounded AI when heuristic is empty", () => {
    expect(
      pickHeaderField("", "Solutions Team", DOC, 50),
    ).toBe("Solutions Team");
  });

  it("drops ungrounded AI", () => {
    expect(pickHeaderField("", "Totally Made Up Role", DOC, 50)).toBe("");
  });
});

describe("pickLongFormField", () => {
  it("prefers heuristic duties when AI invents content", () => {
    const heuristic = "- Build ML pipelines\n- Collaborate with product team";
    const ai = "- Invented duty that is not in the JD at all";
    const picked = pickLongFormField(heuristic, ai, DOC);
    expect(picked).toContain("Build ML pipelines");
    expect(picked).not.toContain("Invented duty");
  });
});
