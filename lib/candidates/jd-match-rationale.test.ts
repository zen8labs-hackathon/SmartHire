import { describe, expect, it } from "vitest";

import {
  encodeJdMatchRationale,
  parseJdMatchRationale,
  sortJdRequirements,
  type JdRequirementCheck,
} from "@/lib/candidates/jd-match-rationale";

const check = (over: Partial<JdRequirementCheck> = {}): JdRequirementCheck => ({
  requirement: "4+ years of native iOS development",
  source: "must_have",
  verdict: "met",
  evidence: "4.5 years of Swift at ABC Corp.",
  ...over,
});

describe("parseJdMatchRationale", () => {
  it("round-trips an encoded envelope", () => {
    const encoded = encodeJdMatchRationale({
      summary: "Strong fit overall.",
      meta: "AI model: vercel_gateway.",
      requirements: [check()],
    });

    expect(parseJdMatchRationale(encoded)).toEqual({
      summary: "Strong fit overall.",
      meta: "AI model: vercel_gateway.",
      requirements: [check()],
    });
  });

  it("stays parseable when the checklist has to be shed for length", () => {
    const encoded = encodeJdMatchRationale({
      summary: "Long.",
      meta: "",
      requirements: Array.from({ length: 40 }, (_, i) =>
        check({ requirement: `Requirement ${i} `.padEnd(400, "x") }),
      ),
    });

    const parsed = parseJdMatchRationale(encoded);
    expect(encoded.length).toBeLessThanOrEqual(8000);
    expect(parsed?.summary).toBe("Long.");
    expect(parsed?.requirements.length).toBeGreaterThan(0);
    expect(parsed?.requirements.length).toBeLessThan(40);
  });

  it("treats legacy prose as a summary with no checklist", () => {
    const legacy =
      "The candidate has over 4 years of hands-on experience.\n\nAI model: openai.";

    expect(parseJdMatchRationale(legacy)).toEqual({
      summary: legacy,
      meta: "",
      requirements: [],
    });
  });

  it("returns null for empty or missing values", () => {
    expect(parseJdMatchRationale(null)).toBeNull();
    expect(parseJdMatchRationale(undefined)).toBeNull();
    expect(parseJdMatchRationale("   ")).toBeNull();
  });

  it("falls back to prose when the JSON is truncated", () => {
    const truncated = '{"v":1,"summary":"Strong fit","requirem';

    expect(parseJdMatchRationale(truncated)).toEqual({
      summary: truncated,
      meta: "",
      requirements: [],
    });
  });

  it("drops malformed entries and defaults unknown verdicts/sources", () => {
    const raw = JSON.stringify({
      v: 1,
      summary: "Mixed.",
      meta: "",
      requirements: [
        check(),
        { requirement: "  ", verdict: "met" },
        "not an object",
        null,
        { requirement: "Kubernetes", verdict: "sort_of", source: "made_up" },
      ],
    });

    const parsed = parseJdMatchRationale(raw);

    expect(parsed?.requirements).toEqual([
      check(),
      {
        requirement: "Kubernetes",
        source: "other",
        verdict: "unclear",
        evidence: "",
      },
    ]);
  });

  it("tolerates a JSON payload that is not an envelope object", () => {
    expect(parseJdMatchRationale("[1,2,3]")).toEqual({
      summary: "[1,2,3]",
      meta: "",
      requirements: [],
    });
  });
});

describe("sortJdRequirements", () => {
  it("orders criteria and must-haves ahead of nice-to-haves", () => {
    const sorted = sortJdRequirements([
      check({ requirement: "Nice", source: "nice_to_have" }),
      check({ requirement: "Other", source: "other" }),
      check({ requirement: "Must", source: "must_have" }),
      check({ requirement: "Criteria", source: "criteria" }),
    ]);

    expect(sorted.map((r) => r.requirement)).toEqual([
      "Criteria",
      "Must",
      "Other",
      "Nice",
    ]);
  });

  it("does not mutate its input", () => {
    const input = [
      check({ requirement: "Nice", source: "nice_to_have" }),
      check({ requirement: "Must", source: "must_have" }),
    ];
    sortJdRequirements(input);

    expect(input[0]?.requirement).toBe("Nice");
  });
});
