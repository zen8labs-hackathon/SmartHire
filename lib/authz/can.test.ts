import { describe, expect, it, vi } from "vitest";

import type { StaffProfileAccess } from "@/lib/admin/profile-access";
import { can, canViewJob, canViewSalary } from "@/lib/authz/can";
import { jobAclVisibleSql } from "@/lib/authz/job-access";

function access(
  overrides: Partial<StaffProfileAccess> & Pick<StaffProfileAccess, "role">,
): StaffProfileAccess {
  const role = overrides.role;
  const isAdmin = role === "admin";
  const isHr = isAdmin || role === "hr";
  return {
    userId: "user-1",
    email: "u@test.com",
    isAdmin,
    isHr,
    isStaff: role !== "none",
    chapterIds: [],
    headedChapterIds: [],
    ...overrides,
    role,
  };
}

function fakeDb(queued: unknown[][] = []) {
  const query = vi.fn();
  for (const rows of queued) {
    query.mockResolvedValueOnce({ rows });
  }
  return { query };
}

describe("jobAclVisibleSql", () => {
  it("binds the user id parameter for profile and chapter-head grants", () => {
    const sql = jobAclVisibleSql(3, "jobs.id");
    expect(sql).toContain("jap.profile_id = $3");
    expect(sql).toContain("pc.profile_id = $3");
    expect(sql).toContain("pc.role = 'head'");
    expect(sql).toContain("jap.job_id = jobs.id");
  });
});

describe("can", () => {
  it("allows HR all job.view without ACL queries", async () => {
    const db = fakeDb();
    await expect(
      can(db, access({ role: "hr" }), "job.view", { jobId: "job-1" }),
    ).resolves.toBe(true);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("allows recruiter job.view when ACL returns a row", async () => {
    const db = fakeDb([[{ ok: 1 }]]);
    await expect(
      canViewJob(db, access({ role: "recruiter" }), "job-1"),
    ).resolves.toBe(true);
    expect(db.query).toHaveBeenCalledOnce();
  });

  it("denies recruiter job.view when ACL is empty", async () => {
    const db = fakeDb([[]]);
    await expect(
      canViewJob(db, access({ role: "recruiter" }), "job-1"),
    ).resolves.toBe(false);
  });

  it("denies salary.view for email-only recruiter even with job access", async () => {
    const db = fakeDb([[]]); // chapter-head check empty
    await expect(
      canViewSalary(db, access({ role: "recruiter" }), "job-1"),
    ).resolves.toBe(false);
  });

  it("allows salary.view for chapter head on the job", async () => {
    const db = fakeDb([[{ ok: 1 }]]);
    await expect(
      canViewSalary(db, access({ role: "recruiter" }), "job-1"),
    ).resolves.toBe(true);
  });

  it("allows salary.view for HR without DB", async () => {
    const db = fakeDb();
    await expect(
      canViewSalary(db, access({ role: "hr" }), "job-1"),
    ).resolves.toBe(true);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("denies job.manage for recruiter without jobId when not a chapter head", async () => {
    const db = fakeDb();
    await expect(
      can(db, access({ role: "recruiter" }), "job.manage"),
    ).resolves.toBe(false);
  });

  it("allows job.manage without jobId for chapter head", async () => {
    const db = fakeDb();
    await expect(
      can(
        db,
        access({ role: "recruiter", headedChapterIds: ["c-1"] }),
        "job.manage",
      ),
    ).resolves.toBe(true);
  });

  it("allows job.manage for recruiter when ACL grants the job", async () => {
    const db = fakeDb([[{ ok: 1 }]]);
    await expect(
      can(db, access({ role: "recruiter" }), "job.manage", { jobId: "job-1" }),
    ).resolves.toBe(true);
  });

  it("allows job.manage for admin", async () => {
    const db = fakeDb();
    await expect(
      can(db, access({ role: "admin" }), "job.manage"),
    ).resolves.toBe(true);
  });
});
