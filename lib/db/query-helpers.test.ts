import { describe, expect, it } from "vitest";

import {
  MAX_LIST_LIMIT,
  buildSetClause,
  clampLimit,
  clampOffset,
  dbDateToIso,
  extractWindowTotal,
} from "@/lib/db/query-helpers";

describe("clampLimit", () => {
  it("defaults to DEFAULT_LIST_LIMIT when omitted", () => {
    expect(clampLimit(undefined)).toBe(50);
  });

  it("caps to MAX_LIST_LIMIT", () => {
    expect(clampLimit(MAX_LIST_LIMIT + 500)).toBe(MAX_LIST_LIMIT);
  });

  it("floors below 1 up to 1", () => {
    expect(clampLimit(0)).toBe(1);
    expect(clampLimit(-5)).toBe(1);
  });

  it("truncates non-integer values", () => {
    expect(clampLimit(10.9)).toBe(10);
  });

  it("ignores non-finite input", () => {
    expect(clampLimit(Number.NaN)).toBe(50);
  });
});

describe("clampOffset", () => {
  it("defaults to 0 when omitted or negative", () => {
    expect(clampOffset(undefined)).toBe(0);
    expect(clampOffset(-10)).toBe(0);
  });

  it("truncates a valid positive offset", () => {
    expect(clampOffset(25.7)).toBe(25);
  });
});

describe("buildSetClause", () => {
  it("builds a positional SET clause skipping undefined fields", () => {
    const { clause, values } = buildSetClause({
      name: "Ada Lovelace",
      email: undefined,
      role: "Engineer",
    });
    expect(clause).toBe("name = $1, role = $2");
    expect(values).toEqual(["Ada Lovelace", "Engineer"]);
  });

  it("offsets placeholder numbers with startIndex", () => {
    const { clause, values } = buildSetClause({ status: "Closed" }, 2);
    expect(clause).toBe("status = $2");
    expect(values).toEqual(["Closed"]);
  });

  it("preserves explicit null as an intentional value", () => {
    const { clause, values } = buildSetClause({ phone: null });
    expect(clause).toBe("phone = $1");
    expect(values).toEqual([null]);
  });

  it("returns an empty clause and values for an all-undefined patch", () => {
    const { clause, values } = buildSetClause({ name: undefined });
    expect(clause).toBe("");
    expect(values).toEqual([]);
  });
});

describe("dbDateToIso", () => {
  it("returns null for null/undefined", () => {
    expect(dbDateToIso(null)).toBeNull();
    expect(dbDateToIso(undefined)).toBeNull();
  });

  it("formats a `pg`-style local-midnight Date without shifting the day", () => {
    // Mirrors exactly what `postgres-date` (pg's default `date` column parser)
    // constructs for a DB value of "2026-07-10": `new Date(year, month, day)`,
    // i.e. local midnight, not UTC. `.toISOString()` would roll this back to
    // "2026-07-09" in any positive-UTC-offset timezone (e.g. Vietnam, +7) --
    // the exact bug this function fixes.
    expect(dbDateToIso(new Date(2026, 6, 10))).toBe("2026-07-10");
  });

  it("pads single-digit month/day", () => {
    expect(dbDateToIso(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("extractWindowTotal", () => {
  it("reads total_count off the first row", () => {
    expect(
      extractWindowTotal([
        { total_count: "42" },
        { total_count: "42" },
      ]),
    ).toBe(42);
  });

  it("returns 0 for an empty result set", () => {
    expect(extractWindowTotal([])).toBe(0);
  });
});
