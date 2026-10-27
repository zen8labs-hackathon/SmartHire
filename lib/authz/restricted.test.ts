import { describe, expect, it } from "vitest";
import { isRestricted, restrict, restrictFields } from "@/lib/authz/restricted";

describe("restricted data", () => {
  it("keeps the value when allowed", () => {
    expect(restrict("30M", true, "r")).toBe("30M");
  });
  it("drops the value from the payload when not allowed", () => {
    const out = restrictFields({ id: "1", salary: "30M" }, ["salary"], false, "Salary is visible to HR only");
    expect(isRestricted(out.salary)).toBe(true);
    expect(JSON.stringify(out)).not.toContain("30M");
    expect(out.id).toBe("1");
  });
  it("returns the row untouched when allowed", () => {
    const row = { salary: "30M" };
    expect(restrictFields(row, ["salary"], true, "x")).toBe(row);
  });
});
