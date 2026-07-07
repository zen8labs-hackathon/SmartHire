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
});
