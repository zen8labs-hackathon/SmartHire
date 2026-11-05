import { describe, expect, it } from "vitest";

import {
  addDays,
  diffDays,
  fmtMin,
  fromLocal,
  isoDateInTz,
  isoWeekday,
  minuteOfDayInTz,
  parseClock,
  parseDuration,
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

  it("parses typed clock times", () => {
    for (const [text, min] of [["9", 540], ["930", 570], ["0930", 570], ["9:30", 570], ["09.30", 570], ["9h30", 570], ["2pm", 840], ["2:15 PM", 855], ["12am", 0], ["12pm", 720], ["23:59", 1439]] as const) {
      expect(parseClock(text), text).toBe(min);
    }
    for (const text of ["", "abc", "24:00", "9:60", "13pm", "0am"]) expect(parseClock(text), text).toBeNull();
  });

  it("parses typed durations", () => {
    for (const [text, min] of [["45", 45], ["45m", 45], ["45 min", 45], ["1h", 60], ["1.5h", 90], ["1,5h", 90], ["1h30", 90], ["1h 30m", 90], ["1:30", 90], ["8h", 480]] as const) {
      expect(parseDuration(text), text).toBe(min);
    }
    for (const text of ["", "x", "4", "481", "9h", "1h75"]) expect(parseDuration(text), text).toBeNull();
  });
});
