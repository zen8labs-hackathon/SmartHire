import { describe, expect, it } from "vitest";

import {
  addDays,
  diffDays,
  fmtMin,
  fromLocal,
  isoDateInTz,
  isoWeekday,
  minuteOfDayInTz,
  weekStart,
  weekdayName,
} from "@/lib/calendar/time";

describe("calendar time (GMT+7)", () => {
  it("maps UTC instants to GMT+7 date and minute", () => {
    // 2026-10-20T17:30Z is 00:30 on Oct 21 in GMT+7
    const d = new Date("2026-10-20T17:30:00Z");
    expect(isoDateInTz(d)).toBe("2026-10-21");
    expect(minuteOfDayInTz(d)).toBe(30);
    // 16:59Z is still 23:59 on Oct 20
    const e = new Date("2026-10-20T16:59:00Z");
    expect(isoDateInTz(e)).toBe("2026-10-20");
    expect(minuteOfDayInTz(e)).toBe(1439);
  });

  it("fromLocal round-trips", () => {
    const d = fromLocal("2026-10-20", 510);
    expect(d.toISOString()).toBe("2026-10-20T01:30:00.000Z");
    expect(isoDateInTz(d)).toBe("2026-10-20");
    expect(minuteOfDayInTz(d)).toBe(510);
  });

  it("weekday, week start and day arithmetic", () => {
    expect(isoWeekday("2026-10-19")).toBe(1);
    expect(isoWeekday("2026-10-25")).toBe(7);
    expect(weekStart("2026-10-25")).toBe("2026-10-19");
    expect(weekStart("2026-10-19")).toBe("2026-10-19");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(diffDays("2026-10-19", "2026-11-02")).toBe(14);
    expect(weekdayName("2026-10-24")).toBe("Saturday");
  });

  it("formats minutes", () => {
    expect(fmtMin(510)).toBe("08:30");
    expect(fmtMin(0)).toBe("00:00");
    expect(fmtMin(1140)).toBe("19:00");
  });
});
