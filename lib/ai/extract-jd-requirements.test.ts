import { beforeEach, describe, expect, it, vi } from "vitest";

const generateTextWithFallback = vi.fn();

vi.mock("@/lib/llm", () => ({
  generateTextWithFallback: (...args: unknown[]) =>
    generateTextWithFallback(...args),
  getConfiguredLanguageModel: () => ({ id: "test-model" }),
  getJdExtractModelId: () => "test-model",
  isLlmInferenceConfigured: () => true,
  llmInferenceDisabledReason: () => "LLM disabled",
}));

const { extractJobRequirements } = await import(
  "@/lib/ai/extract-jd-requirements"
);

function mockOutput(requirements: unknown[]) {
  generateTextWithFallback.mockResolvedValueOnce({
    output: { requirements },
    llmMeta: { provider: "gemini", modelId: "test-model", usedFallback: false },
  });
}

const JD = "Experience requirements (must-have):\n5+ years of React experience\nLead a team of 5 engineers";
const CRITERIA = "Minimum IELTS 7.0 overall";

beforeEach(() => {
  generateTextWithFallback.mockReset();
});

describe("extractJobRequirements", () => {
  it("keeps origin when the quote is really present in the claimed block", async () => {
    mockOutput([
      {
        requirement: "5+ years of React experience",
        importance: "must_have",
        origin: "jd",
        source_quote: "5+ years of React experience",
      },
      {
        requirement: "IELTS 7.0 overall",
        importance: "must_have",
        origin: "criteria",
        source_quote: "Minimum IELTS 7.0 overall",
      },
    ]);

    const items = await extractJobRequirements(JD, CRITERIA);

    expect(items).toEqual([
      {
        requirement: "5+ years of React experience",
        importance: "must_have",
        origin: "jd",
      },
      {
        requirement: "IELTS 7.0 overall",
        importance: "must_have",
        origin: "criteria",
      },
    ]);
  });

  it("demotes to ai_inferred when the quote is not in the source text", async () => {
    mockOutput([
      {
        requirement: "Kubernetes in production",
        importance: "must_have",
        origin: "jd",
        source_quote: "Must have run Kubernetes in production",
      },
    ]);

    const [item] = await extractJobRequirements(JD, CRITERIA);
    expect(item.origin).toBe("ai_inferred");
  });

  it("demotes when the quote belongs to the other block", async () => {
    mockOutput([
      {
        requirement: "IELTS 7.0 overall",
        importance: "must_have",
        origin: "jd", // quote is actually from the criteria block
        source_quote: "Minimum IELTS 7.0 overall",
      },
    ]);

    const [item] = await extractJobRequirements(JD, CRITERIA);
    expect(item.origin).toBe("ai_inferred");
  });

  it("demotes when the model leaves the quote empty but claims a source block", async () => {
    mockOutput([
      {
        requirement: "People management experience",
        importance: "nice_to_have",
        origin: "jd",
        source_quote: "",
      },
    ]);

    const [item] = await extractJobRequirements(JD, CRITERIA);
    expect(item.origin).toBe("ai_inferred");
  });

  it("leaves a genuine ai_inferred entry alone", async () => {
    mockOutput([
      {
        requirement: "People management experience",
        importance: "nice_to_have",
        origin: "ai_inferred",
        source_quote: "",
      },
    ]);

    const [item] = await extractJobRequirements(JD, CRITERIA);
    expect(item.origin).toBe("ai_inferred");
    expect(item.importance).toBe("nice_to_have");
  });

  it("drops entries with no requirement text and de-duplicates near-identical ones", async () => {
    mockOutput([
      {
        requirement: "  ",
        importance: "must_have",
        origin: "jd",
        source_quote: "5+ years of React experience",
      },
      {
        requirement: "5+ years of React experience",
        importance: "must_have",
        origin: "jd",
        source_quote: "5+ years of React experience",
      },
      {
        requirement: "5+  years of React   experience",
        importance: "nice_to_have",
        origin: "jd",
        source_quote: "5+ years of React experience",
      },
    ]);

    const items = await extractJobRequirements(JD, CRITERIA);
    expect(items).toHaveLength(1);
    expect(items[0].requirement).toBe("5+ years of React experience");
  });

  it("defaults unrecognized enum values instead of trusting them", async () => {
    mockOutput([
      {
        requirement: "Something",
        importance: "critical",
        origin: "handbook",
        source_quote: "",
      },
    ]);

    const [item] = await extractJobRequirements(JD, CRITERIA);
    expect(item.importance).toBe("must_have");
    // 'handbook' falls back to 'jd', whose quote then fails verification.
    expect(item.origin).toBe("ai_inferred");
  });

  it("caps the checklist at 20 entries", async () => {
    mockOutput(
      Array.from({ length: 30 }, (_, i) => ({
        requirement: `Requirement ${i}`,
        importance: "must_have",
        origin: "ai_inferred",
        source_quote: "",
      })),
    );

    const items = await extractJobRequirements(JD, CRITERIA);
    expect(items).toHaveLength(20);
  });

  it("skips the LLM call entirely when both blocks are empty", async () => {
    expect(await extractJobRequirements("   ", null)).toEqual([]);
    expect(generateTextWithFallback).not.toHaveBeenCalled();
  });

  it("still runs with only criteria text", async () => {
    mockOutput([
      {
        requirement: "IELTS 7.0 overall",
        importance: "must_have",
        origin: "criteria",
        source_quote: "Minimum IELTS 7.0 overall",
      },
    ]);

    const items = await extractJobRequirements("", CRITERIA);
    expect(items[0].origin).toBe("criteria");
  });
});
