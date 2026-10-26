import { describe, expect, it } from "vitest";

import { validateProbationExtension } from "@/lib/probation/extension";

const base = {
  newEndDate: "2026-12-01",
  reason: "Needs more time on the project",
  startDate: "2026-09-01",
  extendedUntil: null,
  today: "2026-10-26",
};

describe("validateProbationExtension", () => {
  it("accepts a later date with a reason", () => {
    expect(validateProbationExtension(base)).toEqual({ ok: true });
  });

  it("requires a reason", () => {
    expect(validateProbationExtension({ ...base, reason: "  " }).ok).toBe(false);
  });

  it("rejects malformed or impossible dates", () => {
    expect(validateProbationExtension({ ...base, newEndDate: "01/12/2026" }).ok).toBe(false);
    expect(validateProbationExtension({ ...base, newEndDate: "2026-13-45" }).ok).toBe(false);
  });

  it("rejects dates in the past", () => {
    expect(validateProbationExtension({ ...base, newEndDate: "2026-10-01" }).ok).toBe(false);
  });

  it("must be after the start date when never extended", () => {
    const r = validateProbationExtension({ ...base, startDate: "2026-12-01" });
    expect(r.ok).toBe(false);
  });

  it("must be after the previous extension", () => {
    expect(validateProbationExtension({ ...base, extendedUntil: "2026-12-01" }).ok).toBe(false);
    expect(validateProbationExtension({ ...base, extendedUntil: "2026-11-15" }).ok).toBe(true);
  });

  it("accepts Date values from the database", () => {
    expect(
      validateProbationExtension({ ...base, startDate: new Date("2026-09-01T00:00:00Z") }).ok,
    ).toBe(true);
  });
});
