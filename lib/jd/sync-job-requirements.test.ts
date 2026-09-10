import { beforeEach, describe, expect, it, vi } from "vitest";

const extractJobRequirements = vi.fn();
const resolveJobDescriptionText = vi.fn();
const resolveJobEvaluationCriteriaText = vi.fn();
const markJobApplicationsStaleForRematch = vi.fn();
const replaceExtractedJobRequirements = vi.fn();
const getJobById = vi.fn();
const isLlmInferenceConfigured = vi.fn();

vi.mock("@/lib/ai/extract-jd-requirements", () => ({
  extractJobRequirements: (...a: unknown[]) => extractJobRequirements(...a),
}));
vi.mock("@/lib/candidates/resolve-job-description-text", () => ({
  resolveJobDescriptionText: (...a: unknown[]) =>
    resolveJobDescriptionText(...a),
}));
vi.mock("@/lib/candidates/resolve-job-evaluation-criteria-text", () => ({
  resolveJobEvaluationCriteriaText: (...a: unknown[]) =>
    resolveJobEvaluationCriteriaText(...a),
}));
vi.mock("@/lib/db/campaign-applied", () => ({
  markJobApplicationsStaleForRematch: (...a: unknown[]) =>
    markJobApplicationsStaleForRematch(...a),
}));
vi.mock("@/lib/db/job-requirements", () => ({
  replaceExtractedJobRequirements: (...a: unknown[]) =>
    replaceExtractedJobRequirements(...a),
}));
vi.mock("@/lib/db/jobs", () => ({ getJobById: (...a: unknown[]) => getJobById(...a) }));
vi.mock("@/lib/llm", () => ({
  isLlmInferenceConfigured: () => isLlmInferenceConfigured(),
}));
vi.mock("@/lib/db/config/client", () => ({
  getPool: () => ({ query: vi.fn() }),
  withTransaction: (fn: (tx: unknown) => Promise<unknown>) =>
    fn({ query: vi.fn() }),
}));

const { syncJobRequirementsFromJd, syncJobRequirementsQuietly } = await import(
  "@/lib/jd/sync-job-requirements"
);

beforeEach(() => {
  vi.clearAllMocks();
  getJobById.mockResolvedValue({ id: "job-1" });
  isLlmInferenceConfigured.mockReturnValue(true);
  resolveJobDescriptionText.mockResolvedValue("JD text");
  resolveJobEvaluationCriteriaText.mockResolvedValue("Criteria text");
  extractJobRequirements.mockResolvedValue([
    { requirement: "5+ years React", importance: "must_have", origin: "jd" },
  ]);
  markJobApplicationsStaleForRematch.mockResolvedValue(["app-1", "app-2"]);
  replaceExtractedJobRequirements.mockResolvedValue([]);
});

describe("syncJobRequirementsFromJd", () => {
  it("replaces the checklist and reports how many scored applications went stale", async () => {
    const result = await syncJobRequirementsFromJd("job-1");

    expect(result).toEqual({ ok: true, count: 1, staleApplications: 2 });
    expect(replaceExtractedJobRequirements).toHaveBeenCalledWith(
      expect.anything(),
      "job-1",
      [{ requirement: "5+ years React", importance: "must_have", origin: "jd" }],
    );
  });

  it("passes both the JD and criteria text to the extractor", async () => {
    await syncJobRequirementsFromJd("job-1");
    expect(extractJobRequirements).toHaveBeenCalledWith(
      "JD text",
      "Criteria text",
    );
  });

  it("skips a deleted job without calling the LLM", async () => {
    getJobById.mockResolvedValue(null);
    expect(await syncJobRequirementsFromJd("job-1")).toEqual({
      ok: false,
      skipped: "job_gone",
    });
    expect(extractJobRequirements).not.toHaveBeenCalled();
  });

  it("skips when inference is not configured", async () => {
    isLlmInferenceConfigured.mockReturnValue(false);
    expect(await syncJobRequirementsFromJd("job-1")).toEqual({
      ok: false,
      skipped: "llm_disabled",
    });
    expect(extractJobRequirements).not.toHaveBeenCalled();
  });

  it("skips when neither source has any text", async () => {
    resolveJobDescriptionText.mockResolvedValue("   ");
    resolveJobEvaluationCriteriaText.mockResolvedValue(null);
    expect(await syncJobRequirementsFromJd("job-1")).toEqual({
      ok: false,
      skipped: "no_text",
    });
    expect(extractJobRequirements).not.toHaveBeenCalled();
  });

  it("still clears the checklist when the extractor returns nothing", async () => {
    extractJobRequirements.mockResolvedValue([]);
    const result = await syncJobRequirementsFromJd("job-1");

    expect(replaceExtractedJobRequirements).toHaveBeenCalledWith(
      expect.anything(),
      "job-1",
      [],
    );
    expect(result).toEqual({ ok: true, count: 0, staleApplications: 2 });
  });

  it("propagates an LLM failure to the caller", async () => {
    extractJobRequirements.mockRejectedValue(new Error("rate limited"));
    await expect(syncJobRequirementsFromJd("job-1")).rejects.toThrow(
      "rate limited",
    );
  });
});

describe("syncJobRequirementsQuietly", () => {
  it("swallows an LLM failure so a committed JD save cannot 500", async () => {
    extractJobRequirements.mockRejectedValue(new Error("rate limited"));

    const result = await syncJobRequirementsQuietly("job-1");

    expect(result).toEqual({ ok: false, error: "rate limited" });
  });

  it("passes a successful run straight through", async () => {
    expect(await syncJobRequirementsQuietly("job-1")).toEqual({
      ok: true,
      count: 1,
      staleApplications: 2,
    });
  });
});
