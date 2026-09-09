import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FixedJdRequirement } from "@/lib/ai/jd-cv-match";
import type { JdMatchFormulaResult } from "@/lib/candidates/jd-match-formula";

const generateTextWithFallback = vi.fn();

vi.mock("@/lib/llm", () => ({
  generateTextWithFallback: (...args: unknown[]) =>
    generateTextWithFallback(...args),
  getConfiguredLanguageModel: () => ({ id: "test-model" }),
  isLlmInferenceConfigured: () => true,
  llmInferenceDisabledReason: () => "LLM disabled",
  formatLlmCallLabel: () => "test-model",
}));

const { scoreCvAgainstJobDescriptionHybrid } = await import(
  "@/lib/ai/jd-cv-match"
);
const { parseJdMatchRationale } = await import(
  "@/lib/candidates/jd-match-rationale"
);

const FORMULA: JdMatchFormulaResult = {
  score: 50,
  summary: "Formula summary.",
  breakdown: {
    jdHintCount: 0,
    matchedHints: 0,
    candidateSkillCount: 0,
    candidateSkillsMatchedInJd: 0,
  } as JdMatchFormulaResult["breakdown"],
};

const REQUIREMENTS: FixedJdRequirement[] = [
  { requirement: "5+ years React", importance: "must_have", origin: "jd" },
  { requirement: "IELTS 7.0", importance: "must_have", origin: "criteria" },
  { requirement: "Mentoring juniors", importance: "bonus", origin: "manual" },
];

function mockVerdicts(verdicts: unknown[], score = 70) {
  generateTextWithFallback.mockResolvedValueOnce({
    output: { verdicts, rationale: "Rationale.", score },
    llmMeta: { provider: "gemini", modelId: "test-model", usedFallback: false },
  });
}

async function score(requirements: FixedJdRequirement[] | undefined) {
  return scoreCvAgainstJobDescriptionHybrid("CV text", "JD text", FORMULA, {
    blend: false,
    fixedRequirements: requirements,
  });
}

beforeEach(() => {
  generateTextWithFallback.mockReset();
});

describe("scoreCvAgainstJobDescriptionHybrid with a fixed checklist", () => {
  it("sends the numbered checklist and asks only for verdicts", async () => {
    mockVerdicts([
      { index: 1, verdict: "met", evidence: "6 years React" },
      { index: 2, verdict: "missing", evidence: "No English level given" },
      { index: 3, verdict: "unclear", evidence: "" },
    ]);

    await score(REQUIREMENTS);

    const [args] = generateTextWithFallback.mock.calls[0];
    expect(args.prompt).toContain("1. [MUST-HAVE] 5+ years React");
    expect(args.prompt).toContain("2. [MUST-HAVE] IELTS 7.0");
    expect(args.prompt).toContain("3. [bonus] Mentoring juniors");
    // The self-extracting instruction must not survive into this path.
    expect(args.system).not.toContain("First extract");
    expect(args.system).toContain("do not add, drop, merge, or reword");
  });

  it("returns one check per stored requirement, in stored order", async () => {
    mockVerdicts([
      { index: 1, verdict: "met", evidence: "6 years React" },
      { index: 2, verdict: "missing", evidence: "No English level given" },
      { index: 3, verdict: "partial", evidence: "Led a study group" },
    ]);

    const result = await score(REQUIREMENTS);

    expect(result.requirements.map((r) => r.requirement)).toEqual([
      "5+ years React",
      "IELTS 7.0",
      "Mentoring juniors",
    ]);
    expect(result.requirements.map((r) => r.verdict)).toEqual([
      "met",
      "missing",
      "partial",
    ]);
  });

  it("maps a criteria-origin requirement to the criteria source label", async () => {
    mockVerdicts([
      { index: 1, verdict: "met", evidence: "x" },
      { index: 2, verdict: "met", evidence: "y" },
      { index: 3, verdict: "met", evidence: "z" },
    ]);

    const result = await score(REQUIREMENTS);

    expect(result.requirements.map((r) => r.source)).toEqual([
      "must_have", // jd + must_have
      "criteria", // origin wins over importance
      "nice_to_have", // bonus collapses to nice_to_have
    ]);
  });

  it("fills in items the model skipped as unclear instead of dropping them", async () => {
    mockVerdicts([{ index: 1, verdict: "met", evidence: "6 years React" }]);

    const result = await score(REQUIREMENTS);

    expect(result.requirements).toHaveLength(3);
    expect(result.requirements[1]).toMatchObject({
      requirement: "IELTS 7.0",
      verdict: "unclear",
      evidence: "",
    });
  });

  it("ignores out-of-range and duplicate indexes from the model", async () => {
    mockVerdicts([
      { index: 99, verdict: "met", evidence: "bogus" },
      { index: 1, verdict: "met", evidence: "real" },
      { index: 1, verdict: "missing", evidence: "duplicate, ignored" },
    ]);

    const result = await score(REQUIREMENTS);

    expect(result.requirements[0].evidence).toBe("real");
    expect(result.requirements).toHaveLength(3);
  });

  it("falls back to array position when the model omits index", async () => {
    mockVerdicts([
      { verdict: "met", evidence: "first" },
      { verdict: "partial", evidence: "second" },
      { verdict: "missing", evidence: "third" },
    ]);

    const result = await score(REQUIREMENTS);

    expect(result.requirements.map((r) => r.verdict)).toEqual([
      "met",
      "partial",
      "missing",
    ]);
  });

  it("encodes the checklist into the stored rationale envelope", async () => {
    mockVerdicts([
      { index: 1, verdict: "met", evidence: "6 years React" },
      { index: 2, verdict: "missing", evidence: "none" },
      { index: 3, verdict: "unclear", evidence: "" },
    ]);

    const result = await score(REQUIREMENTS);
    const parsed = parseJdMatchRationale(result.rationale);

    expect(parsed?.requirements).toHaveLength(3);
    expect(parsed?.summary).toBe("Rationale.");
  });

  it("keeps the self-extracting prompt when no checklist is stored", async () => {
    generateTextWithFallback.mockResolvedValueOnce({
      output: {
        requirements: [
          {
            requirement: "Derived requirement",
            source: "must_have",
            verdict: "met",
            evidence: "e",
          },
        ],
        rationale: "Rationale.",
        score: 80,
      },
      llmMeta: { provider: "gemini", modelId: "test-model", usedFallback: false },
    });

    const result = await score(undefined);

    const [args] = generateTextWithFallback.mock.calls[0];
    expect(args.system).toContain("First extract 5–12 concrete requirements");
    expect(result.requirements[0].requirement).toBe("Derived requirement");
  });

  it("treats an empty checklist array as no checklist", async () => {
    generateTextWithFallback.mockResolvedValueOnce({
      output: {
        requirements: [
          { requirement: "R", source: "other", verdict: "met", evidence: "e" },
        ],
        rationale: "Rationale.",
        score: 80,
      },
      llmMeta: { provider: "gemini", modelId: "test-model", usedFallback: false },
    });

    await score([]);

    const [args] = generateTextWithFallback.mock.calls[0];
    expect(args.system).toContain("First extract");
  });
});
