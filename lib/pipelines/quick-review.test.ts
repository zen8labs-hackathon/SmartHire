import { describe, expect, it } from "vitest";

import type { JdRequirementCheck } from "@/lib/candidates/jd-match-rationale";
import {
  reviewQueueNeighbors,
  groupRequirementsByVerdict,
} from "./quick-review";

describe("reviewQueueNeighbors", () => {
  const queue = ["a", "b", "c"];

  it("finds prev/next around the current id", () => {
    expect(reviewQueueNeighbors(queue, "b")).toEqual({
      index: 1,
      total: 3,
      prevId: "a",
      nextId: "c",
    });
    expect(reviewQueueNeighbors(queue, "a").prevId).toBeNull();
    expect(reviewQueueNeighbors(queue, "c").nextId).toBeNull();
  });

  it("reports -1 when the id is not in the queue (or there is no id)", () => {
    expect(reviewQueueNeighbors(queue, "z").index).toBe(-1);
    expect(reviewQueueNeighbors(queue, null)).toEqual({
      index: -1,
      total: 3,
      prevId: null,
      nextId: null,
    });
  });
});

describe("groupRequirementsByVerdict", () => {
  const req = (
    requirement: string,
    verdict: JdRequirementCheck["verdict"],
  ): JdRequirementCheck => ({
    requirement,
    source: "must_have",
    verdict,
    evidence: "",
  });

  it("buckets every verdict and keeps the incoming order inside a bucket", () => {
    const g = groupRequirementsByVerdict([
      req("a", "missing"),
      req("b", "met"),
      req("c", "missing"),
      req("d", "partial"),
      req("e", "unclear"),
    ]);
    expect(g.missing.map((r) => r.requirement)).toEqual(["a", "c"]);
    expect(g.partial.map((r) => r.requirement)).toEqual(["d"]);
    expect(g.unclear.map((r) => r.requirement)).toEqual(["e"]);
    expect(g.met.map((r) => r.requirement)).toEqual(["b"]);
  });

  it("returns empty buckets for no requirements", () => {
    expect(groupRequirementsByVerdict([])).toEqual({
      missing: [],
      partial: [],
      unclear: [],
      met: [],
    });
  });
});
