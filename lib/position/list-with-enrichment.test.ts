import { describe, expect, it } from "vitest";
import {
  daysUntil,
  jobToPositionStatus,
  employmentToPositionType,
  isPositionStatus,
  isPositionType,
} from "@/lib/position/list-with-enrichment";

describe("jobToPositionStatus", () => {
  it("maps DB statuses to UI statuses", () => {
    expect(jobToPositionStatus({ status: "Hiring", update_note: null })).toBe("Open");
    expect(jobToPositionStatus({ status: "Pending", update_note: null })).toBe("On hold");
    expect(jobToPositionStatus({ status: "Pending", update_note: "[Draft]" })).toBe("Draft");
    expect(jobToPositionStatus({ status: "Done", update_note: null })).toBe("Closed");
    expect(jobToPositionStatus({ status: "Closed", update_note: "[Draft]" })).toBe("Closed");
  });
});

describe("employmentToPositionType", () => {
  it("detects internships case-insensitively", () => {
    expect(employmentToPositionType("Internship")).toBe("Internship");
    expect(employmentToPositionType("INTERN program")).toBe("Internship");
    expect(employmentToPositionType("Full-time")).toBe("Full-time");
    expect(employmentToPositionType(null)).toBe("Full-time");
  });
});

describe("daysUntil", () => {
  const now = new Date("2026-10-12T15:00:00Z");
  it("computes whole UTC days", () => {
    expect(daysUntil("2026-10-12", now)).toBe(0);
    expect(daysUntil("2026-10-22", now)).toBe(10);
    expect(daysUntil("2026-10-10", now)).toBe(-2);
  });
  it("returns null for missing/invalid", () => {
    expect(daysUntil(null, now)).toBeNull();
    expect(daysUntil("nope", now)).toBeNull();
  });
});

describe("guards", () => {
  it("validate status and type", () => {
    expect(isPositionStatus("On hold")).toBe(true);
    expect(isPositionStatus("Hiring")).toBe(false);
    expect(isPositionType("Internship")).toBe(true);
    expect(isPositionType("x")).toBe(false);
  });
});
