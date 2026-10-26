import { describe, expect, it } from "vitest";
import { normalizeBusyShape, type BusyShapeBody } from "./busy";

// Wednesday 2026-10-21, 10:00 GMT+7.
const now = new Date("2026-10-21T03:00:00Z");

const shape = (over: Partial<BusyShapeBody>): BusyShapeBody => ({
  startDate: "2026-10-22",
  allDay: false,
  fromMin: 540,
  toMin: 600,
  repeat: "none",
  untilDate: null,
  note: null,
  onOverlap: "keep",
  days: [],
  ...over,
});

const err = (b: Partial<BusyShapeBody>, future?: "first" | "any") =>
  normalizeBusyShape(shape(b), { now, future }).error;

describe("normalizeBusyShape", () => {
  it("accepts a future block and clears all-day minutes", () => {
    expect(err({})).toBeNull();
    const { shape: s, error } = normalizeBusyShape(shape({ allDay: true }), { now });
    expect(error).toBeNull();
    expect([s.fromMin, s.toMin]).toEqual([null, null]);
  });

  it("reports a time error before anything else (D-03-2 R1)", () => {
    expect(err({ fromMin: 600, toMin: 540, startDate: "2026-10-01" })).toBe("Start must be before end.");
  });

  it("rejects a repeat with no days (BR-03-06)", () => {
    // Saturday to Sunday has no weekdays.
    expect(err({ repeat: "weekdays", startDate: "2026-10-24", untilDate: "2026-10-25" }))
      .toBe("This repeat has no days before the end date.");
  });

  it("checks days before the future rule (D-03-2 R2 before R3)", () => {
    expect(err({ repeat: "weekdays", startDate: "2026-10-17", untilDate: "2026-10-18" }))
      .toBe("This repeat has no days before the end date.");
  });

  it("rejects busy time in the past (BR-03-07)", () => {
    expect(err({ startDate: "2026-10-20" })).toBe("Choose a future time.");
    // Today 09:00 has passed at 10:00; 10:00 itself is allowed.
    expect(err({ startDate: "2026-10-21" })).toBe("Choose a future time.");
    expect(err({ startDate: "2026-10-21", fromMin: 600, toMin: 630 })).toBeNull();
    expect(err({ startDate: "2026-10-21", allDay: true })).toBeNull();
  });

  it("allows a started series when any day is still ahead", () => {
    const series = { repeat: "weekly" as const, days: [3], startDate: "2026-10-14", untilDate: "2026-10-28" };
    expect(err(series)).toBe("Choose a future time.");
    expect(err(series, "any")).toBeNull();
    expect(err({ ...series, untilDate: "2026-10-20" }, "any")).toBe("Choose a future time.");
  });

  it("needs at least one weekday for a weekly block", () => {
    const w = { repeat: "weekly" as const, untilDate: "2026-11-30" };
    expect(err({ ...w, days: [] })).toBe("Pick at least one weekday.");
    expect(err({ ...w, days: [2] })).toBeNull();
    expect(err({ days: [2] })).toBe("Only a weekly block can pick weekdays.");
  });

  it("rejects a weekly chip with no matching day before Until (AC-03-05)", () => {
    // Start Thu 2026-10-22, until Fri 10-23: no Monday in between.
    const r = normalizeBusyShape(
      shape({ repeat: "weekly", days: [1], startDate: "2026-10-22", untilDate: "2026-10-23" }),
      { now },
    );
    expect(r.error).toBe("This repeat has no days before the end date.");
  });
});
