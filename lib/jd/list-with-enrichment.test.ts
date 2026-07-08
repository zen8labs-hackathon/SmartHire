import { describe, expect, it } from "vitest";

import { defaultJdStartDateRangeIso } from "@/lib/jd/list-with-enrichment";

describe("defaultJdStartDateRangeIso", () => {
  it("returns `to` as today (UTC) and `from` as 3 months earlier", () => {
    const { from, to } = defaultJdStartDateRangeIso();

    const now = new Date();
    const expectedTo = now.toISOString().slice(0, 10);
    const expectedFrom = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, now.getUTCDate()),
    )
      .toISOString()
      .slice(0, 10);

    expect(to).toBe(expectedTo);
    expect(from).toBe(expectedFrom);
    expect(from < to).toBe(true);
  });

  it("returns YYYY-MM-DD formatted strings", () => {
    const { from, to } = defaultJdStartDateRangeIso();
    expect(from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
