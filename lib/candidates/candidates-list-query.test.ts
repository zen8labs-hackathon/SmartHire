import { describe, expect, it } from "vitest";

import {
  CANDIDATES_LIST_DEFAULT_LIMIT,
  CANDIDATES_LIST_MAX_LIMIT,
  buildCandidatesListSearchParams,
  parseCandidatesListQuery,
} from "@/lib/candidates/candidates-list-query";

describe("parseCandidatesListQuery", () => {
  it("defaults to all mode when limit omitted", () => {
    const { query } = parseCandidatesListQuery(new URLSearchParams());
    expect(query.all).toBe(true);
    expect(query.limit).toBeUndefined();
  });

  it("parses limit and offset", () => {
    const { query } = parseCandidatesListQuery(
      new URLSearchParams({ limit: "25", offset: "50", status: "Interview" }),
    );
    expect(query.all).toBe(false);
    expect(query.limit).toBe(25);
    expect(query.offset).toBe(50);
    expect(query.status).toBe("Interview");
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

  it("parses contactFields=true into contactFieldsOnly", () => {
    const { query } = parseCandidatesListQuery(
      new URLSearchParams({ contactFields: "true" }),
    );
    expect(query.contactFieldsOnly).toBe(true);
  });

  it("defaults contactFieldsOnly to false when omitted", () => {
    const { query } = parseCandidatesListQuery(new URLSearchParams());
    expect(query.contactFieldsOnly).toBe(false);
  });

  it("parses stageMappingId/subStateId/legacyStatus when all three are valid", () => {
    const stageMappingId = "11111111-1111-4111-8111-111111111111";
    const subStateId = "22222222-2222-4222-8222-222222222222";
    const { query } = parseCandidatesListQuery(
      new URLSearchParams({
        stageMappingId,
        subStateId,
        legacyStatus: "Interview",
      }),
    );
    expect(query.stageMappingId).toBe(stageMappingId);
    expect(query.subStateId).toBe(subStateId);
    expect(query.legacyStatus).toBe("Interview");
  });

  it("drops subStateId/legacyStatus when stageMappingId is missing or invalid", () => {
    const { query } = parseCandidatesListQuery(
      new URLSearchParams({
        subStateId: "22222222-2222-4222-8222-222222222222",
        legacyStatus: "Interview",
      }),
    );
    expect(query.stageMappingId).toBeUndefined();
    expect(query.subStateId).toBeUndefined();
    expect(query.legacyStatus).toBeUndefined();
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

  it("rejects a legacyStatus value that isn't a known CandidateStatus", () => {
    const stageMappingId = "11111111-1111-4111-8111-111111111111";
    const { query } = parseCandidatesListQuery(
      new URLSearchParams({
        stageMappingId,
        subStateId: "22222222-2222-4222-8222-222222222222",
        legacyStatus: "status),or(is_active.eq.true",
      }),
    );
    expect(query.legacyStatus).toBeUndefined();
  });
});

describe("buildCandidatesListSearchParams", () => {
  it("round-trips paginated query", () => {
    const params = buildCandidatesListSearchParams({
      limit: CANDIDATES_LIST_DEFAULT_LIMIT,
      offset: 0,
      q: "ada",
      status: "New",
    });
    expect(params.get("limit")).toBe(String(CANDIDATES_LIST_DEFAULT_LIMIT));
    expect(params.get("q")).toBe("ada");
    expect(params.get("all")).toBeNull();
  });

  it("sets all=true for full list", () => {
    const params = buildCandidatesListSearchParams({ all: true });
    expect(params.get("all")).toBe("true");
  });

  it("sets contactFields=true when contactFieldsOnly is set", () => {
    const params = buildCandidatesListSearchParams({
      all: true,
      contactFieldsOnly: true,
    });
    expect(params.get("contactFields")).toBe("true");
  });

  it("omits contactFields when contactFieldsOnly is not set", () => {
    const params = buildCandidatesListSearchParams({ all: true });
    expect(params.get("contactFields")).toBeNull();
  });

  it("round-trips stageMappingId/subStateId/legacyStatus", () => {
    const params = buildCandidatesListSearchParams({
      all: true,
      stageMappingId: "11111111-1111-4111-8111-111111111111",
      subStateId: "22222222-2222-4222-8222-222222222222",
      legacyStatus: "Interview",
    });
    expect(params.get("stageMappingId")).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(params.get("subStateId")).toBe(
      "22222222-2222-4222-8222-222222222222",
    );
    expect(params.get("legacyStatus")).toBe("Interview");
  });
});
