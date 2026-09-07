import { describe, expect, it, vi } from "vitest";

import type { StaffProfileAccess } from "@/lib/admin/profile-access";
import type { CampaignAppliedAdminRow } from "@/lib/db/campaign-applied-list";
import {
  redactAdminRowSalary,
  redactAdminRowSalaryForAccess,
  redactExpectedSalary,
} from "@/lib/authz/redact-salary";

function access(
  overrides: Partial<StaffProfileAccess> & Pick<StaffProfileAccess, "role">,
): StaffProfileAccess {
  const role = overrides.role;
  const isAdmin = role === "admin";
  const isHr = isAdmin || role === "hr";
  return {
    userId: "user-1",
    email: "u@test.com",
    username: "u",
    isAdmin,
    isHr,
    isStaff: role !== "none",
    chapterIds: [],
    headedChapterIds: [],
    ...overrides,
    role,
  };
}

describe("redactExpectedSalary", () => {
  it("keeps expected_salary when the caller may view it", () => {
    expect(redactExpectedSalary({ expected_salary: "3000" }, true)).toEqual({
      expected_salary: "3000",
    });
  });

  it("nulls expected_salary when the caller may not view it", () => {
    expect(redactExpectedSalary({ expected_salary: "3000" }, false)).toEqual({
      expected_salary: null,
    });
  });

  it("leaves every other field intact and does not mutate the input", () => {
    const row = { expected_salary: "3000", name: "Ada", job_id: "job-1" };
    const out = redactExpectedSalary(row, false);
    expect(out).toEqual({ expected_salary: null, name: "Ada", job_id: "job-1" });
    expect(row.expected_salary).toBe("3000");
  });
});

describe("redactAdminRowSalaryForAccess", () => {
  const row = {
    id: "app-1",
    job_id: "job-1",
    expected_salary: "4200",
  } as unknown as CampaignAppliedAdminRow;

  it("keeps salary for HR without an ACL query", async () => {
    const db = { query: vi.fn() };
    const out = await redactAdminRowSalaryForAccess(
      db,
      access({ role: "hr" }),
      row,
    );
    expect(out.expected_salary).toBe("4200");
    expect(db.query).not.toHaveBeenCalled();
  });

  it("keeps salary for a chapter head granted on the job", async () => {
    const db = { query: vi.fn().mockResolvedValueOnce({ rows: [{ ok: 1 }] }) };
    const out = await redactAdminRowSalaryForAccess(
      db,
      access({ role: "recruiter" }),
      row,
    );
    expect(out.expected_salary).toBe("4200");
  });

  it("strips salary for a recruiter merely added to the job", async () => {
    const db = { query: vi.fn().mockResolvedValueOnce({ rows: [] }) };
    const out = await redactAdminRowSalaryForAccess(
      db,
      access({ role: "recruiter" }),
      row,
    );
    expect(out.expected_salary).toBeNull();
    expect(out.id).toBe("app-1");
  });
});

describe("redactAdminRowSalary", () => {
  it("passes the row through unchanged when canView is true", () => {
    const row = { id: "x", expected_salary: "1" } as unknown as CampaignAppliedAdminRow;
    expect(redactAdminRowSalary(row, true)).toBe(row);
  });
});
