import { describe, expect, it } from "vitest";

import { formatExpectedSalaryDisplay } from "./format-expected-salary";

describe("formatExpectedSalaryDisplay", () => {
  it("returns em dash for empty values", () => {
    expect(formatExpectedSalaryDisplay(null)).toBe("—");
    expect(formatExpectedSalaryDisplay(undefined)).toBe("—");
    expect(formatExpectedSalaryDisplay("")).toBe("—");
    expect(formatExpectedSalaryDisplay("   ")).toBe("—");
  });

  it("formats a plain number with vi-VN grouping", () => {
    expect(formatExpectedSalaryDisplay("20000000")).toBe("20.000.000");
    expect(formatExpectedSalaryDisplay("18,000,000")).toBe("18.000.000");
  });

  it("formats a numeric range with an en dash", () => {
    expect(formatExpectedSalaryDisplay("18000000-20000000")).toBe(
      "18.000.000 – 20.000.000",
    );
    expect(formatExpectedSalaryDisplay("15.000.000 – 20.000.000")).toBe(
      "15.000.000 – 20.000.000",
    );
  });

  it("keeps free-text notes as trimmed text", () => {
    expect(formatExpectedSalaryDisplay("  20 triệu  ")).toBe("20 triệu");
    expect(formatExpectedSalaryDisplay("negotiable")).toBe("negotiable");
    expect(formatExpectedSalaryDisplay("18-20 triệu")).toBe("18-20 triệu");
  });
});
