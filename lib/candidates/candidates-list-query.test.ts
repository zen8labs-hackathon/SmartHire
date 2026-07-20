import { describe, expect, it, vi } from "vitest";

import {
  CANDIDATES_LIST_DEFAULT_LIMIT,
  CANDIDATES_LIST_MAX_LIMIT,
  buildCandidatesListSearchParams,
  parseCandidatesListQuery,
  queryCandidatesList,
} from "@/lib/candidates/candidates-list-query";

const STAGE_MAPPING_ID = "11111111-1111-4111-8111-111111111111";
const SUB_STATE_ID = "22222222-2222-4222-8222-222222222222";
const JOB_ID = "33333333-3333-4333-8333-333333333333";

describe("parseCandidatesListQuery", () => {
  it("defaults to all mode when limit omitted", () => {
    const { query } = parseCandidatesListQuery(new URLSearchParams());
    expect(query.all).toBe(true);
    expect(query.limit).toBeUndefined();
  });

  it("parses limit and offset", () => {
    const { query } = parseCandidatesListQuery(
      new URLSearchParams({ limit: "25", offset: "50" }),
    );
    expect(query.all).toBe(false);
    expect(query.limit).toBe(25);
    expect(query.offset).toBe(50);
  });

  it("caps limit to max", () => {
    const { query } = parseCandidatesListQuery(
      new URLSearchParams({ limit: String(CANDIDATES_LIST_MAX_LIMIT + 500) }),
    );
    expect(query.limit).toBe(CANDIDATES_LIST_MAX_LIMIT);
  });

  it("parses all=true", () => {
    const { query } = parseCandidatesListQuery(
      new URLSearchParams({ all: "true", limit: "10" }),
    );
    expect(query.all).toBe(true);
  });

  it("parses a valid jobId", () => {
    const { query } = parseCandidatesListQuery(
      new URLSearchParams({ jobId: JOB_ID }),
    );
    expect(query.jobId).toBe(JOB_ID);
  });

  it("drops a non-UUID jobId", () => {
    const { query } = parseCandidatesListQuery(
      new URLSearchParams({ jobId: "not-a-uuid" }),
    );
    expect(query.jobId).toBeUndefined();
  });

  it("parses stageMappingId/subStateId when both are valid", () => {
    const { query } = parseCandidatesListQuery(
      new URLSearchParams({
        stageMappingId: STAGE_MAPPING_ID,
        subStateId: SUB_STATE_ID,
      }),
    );
    expect(query.stageMappingId).toBe(STAGE_MAPPING_ID);
    expect(query.subStateId).toBe(SUB_STATE_ID);
  });

  it("drops subStateId when stageMappingId is missing or invalid", () => {
    const { query } = parseCandidatesListQuery(
      new URLSearchParams({ subStateId: SUB_STATE_ID }),
    );
    expect(query.stageMappingId).toBeUndefined();
    expect(query.subStateId).toBeUndefined();
  });

  it("rejects a non-UUID stageMappingId/subStateId", () => {
    const { query } = parseCandidatesListQuery(
      new URLSearchParams({
        stageMappingId: "not-a-uuid",
        subStateId: "also-not-a-uuid",
      }),
    );
    expect(query.stageMappingId).toBeUndefined();
    expect(query.subStateId).toBeUndefined();
  });

  it("parses upload date range", () => {
    const { query } = parseCandidatesListQuery(
      new URLSearchParams({ uploadFrom: "2026-01-01", uploadTo: "2026-01-31" }),
    );
    expect(query.uploadFrom).toBe("2026-01-01");
    expect(query.uploadTo).toBe("2026-01-31");
  });
});

describe("buildCandidatesListSearchParams", () => {
  it("round-trips paginated query", () => {
    const params = buildCandidatesListSearchParams({
      limit: CANDIDATES_LIST_DEFAULT_LIMIT,
      offset: 0,
      q: "ada",
    });
    expect(params.get("limit")).toBe(String(CANDIDATES_LIST_DEFAULT_LIMIT));
    expect(params.get("q")).toBe("ada");
    expect(params.get("all")).toBeNull();
  });

  it("sets all=true for full list", () => {
    const params = buildCandidatesListSearchParams({ all: true });
    expect(params.get("all")).toBe("true");
  });

  it("round-trips jobId/stageMappingId/subStateId", () => {
    const params = buildCandidatesListSearchParams({
      all: true,
      jobId: JOB_ID,
      stageMappingId: STAGE_MAPPING_ID,
      subStateId: SUB_STATE_ID,
    });
    expect(params.get("jobId")).toBe(JOB_ID);
    expect(params.get("stageMappingId")).toBe(STAGE_MAPPING_ID);
    expect(params.get("subStateId")).toBe(SUB_STATE_ID);
  });
});

describe("queryCandidatesList", () => {
  function fakeDb(rows: unknown[]) {
    return { query: vi.fn().mockResolvedValueOnce({ rows }) };
  }

  it("paginates and returns hasMore based on total", async () => {
    const db = fakeDb([{ id: "app-1", total_count: "3" }]);

    const result = await queryCandidatesList(db, { limit: 1, offset: 0 });

    expect(result.error).toBeNull();
    expect(result.candidates).toHaveLength(1);
    expect(result.pagination).toEqual({
      limit: 1,
      offset: 0,
      total: 3,
      hasMore: true,
    });
  });

  it("does not paginate when all is set", async () => {
    const db = fakeDb([]);

    const result = await queryCandidatesList(db, { all: true });

    expect(result.pagination).toBeNull();
  });

  it("returns an error string instead of throwing on DB failure", async () => {
    const db = { query: vi.fn().mockRejectedValueOnce(new Error("boom")) };

    const result = await queryCandidatesList(db, {});

    expect(result.error).toBe("boom");
    expect(result.candidates).toEqual([]);
    expect(result.pagination).toBeNull();
  });
});
