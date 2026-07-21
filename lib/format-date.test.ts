import { describe, expect, it } from "vitest";
import { formatDisplayDate, formatDisplayDateTime } from "./format-date";

describe("formatDisplayDate", () => {
  it("formats YYYY-MM-DD calendar strings without timezone shift", () => {
    expect(formatDisplayDate("2026-07-20")).toBe("2026/07/20");
  });

  it("formats Date values as local yyyy/mm/dd", () => {
    expect(formatDisplayDate(new Date(2026, 6, 20))).toBe("2026/07/20");
  });

  it("returns em dash for empty/invalid", () => {
    expect(formatDisplayDate(null)).toBe("—");
    expect(formatDisplayDate("")).toBe("—");
    expect(formatDisplayDate("not-a-date")).toBe("—");
  });
});

describe("formatDisplayDateTime", () => {
  it("formats local date and time", () => {
    expect(formatDisplayDateTime(new Date(2026, 6, 20, 9, 5))).toBe(
      "2026/07/20 09:05",
    );
  });

  it("returns em dash for empty", () => {
    expect(formatDisplayDateTime(null)).toBe("—");
  });
});
