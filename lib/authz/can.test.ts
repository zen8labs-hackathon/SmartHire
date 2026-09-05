import { describe, expect, it, vi } from "vitest";

import type { StaffProfileAccess } from "@/lib/admin/profile-access";
import {
  can,
  canViewJob,
  canViewSalary,
  filterViewableJobIds,
} from "@/lib/authz/can";
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

// ── Requirement: only a chapter head, admin, or HR may see a candidate's
// expected salary. Everyone else who is added to the job (direct profile
// grant, or plain chapter member) can work the job but the salary stays
// hidden from them.
describe("policy: expected-salary visibility", () => {
  it("admin may view expected salary (role catalog, no ACL round trip)", async () => {
    const db = fakeDb();
    await expect(
      canViewSalary(db, access({ role: "admin" }), "job-1"),
    ).resolves.toBe(true);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("HR may view expected salary (no ACL round trip)", async () => {
    const db = fakeDb();
    await expect(
      canViewSalary(db, access({ role: "hr" }), "job-1"),
    ).resolves.toBe(true);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("a chapter head granted on the job may view expected salary", async () => {
    const db = fakeDb([[{ ok: 1 }]]); // isChapterHeadGrantedOnJob → row
    await expect(
      canViewSalary(db, access({ role: "recruiter" }), "job-1"),
    ).resolves.toBe(true);
  });

  it("a recruiter added to the job by direct profile grant may NOT view expected salary", async () => {
    // This caller passes job.view, but salary only asks "chapter head on this
    // job?" — no rows → denied.
    const db = fakeDb([[]]);
    await expect(
      canViewSalary(db, access({ role: "recruiter" }), "job-1"),
    ).resolves.toBe(false);
  });

  it("a plain chapter member (non-head) of a granted chapter may NOT view expected salary", async () => {
    const db = fakeDb([[]]); // isChapterHeadGrantedOnJob requires pc.role = 'head'
    await expect(
      canViewSalary(
        db,
        access({ role: "recruiter", chapterIds: ["c-1"] }),
        "job-1",
      ),
    ).resolves.toBe(false);
  });

  it("a chapter head NOT granted on this job may NOT view its candidates' salary", async () => {
    const db = fakeDb([[]]);
    await expect(
      canViewSalary(
        db,
        access({ role: "recruiter", headedChapterIds: ["c-other"] }),
        "job-1",
      ),
    ).resolves.toBe(false);
  });

  it("a recruiter cannot view salary with no job in scope", async () => {
    const db = fakeDb();
    await expect(
      canViewSalary(db, access({ role: "recruiter" }), null),
    ).resolves.toBe(false);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("role=none cannot view salary", async () => {
    const db = fakeDb([[]]);
    await expect(
      canViewSalary(db, access({ role: "none" }), "job-1"),
    ).resolves.toBe(false);
  });
});

// ── Requirement: a job is visible only to people explicitly added to it —
// a direct profile grant, or being the head of a chapter granted on the job.
// HR/admin see every job; unadded staff and plain chapter members see none.
describe("policy: job visibility", () => {
  it("HR sees every job without an ACL round trip", async () => {
    const db = fakeDb();
    await expect(canViewJob(db, access({ role: "hr" }), "job-1")).resolves.toBe(
      true,
    );
    expect(db.query).not.toHaveBeenCalled();
  });

  it("admin sees every job", async () => {
    const db = fakeDb();
    await expect(
      canViewJob(db, access({ role: "admin" }), "job-1"),
    ).resolves.toBe(true);
  });

  it("a recruiter added by direct profile grant can view the job", async () => {
    const db = fakeDb([[{ ok: 1 }]]); // canViewJobViaAcl → row
    await expect(
      canViewJob(db, access({ role: "recruiter" }), "job-1"),
    ).resolves.toBe(true);
  });

  it("a recruiter not added to the job cannot view it", async () => {
    const db = fakeDb([[]]);
    await expect(
      canViewJob(db, access({ role: "recruiter" }), "job-1"),
    ).resolves.toBe(false);
  });

  it("role=none cannot view the job (fails the role catalog before any ACL query)", async () => {
    const db = fakeDb();
    await expect(
      canViewJob(db, access({ role: "none" }), "job-1"),
    ).resolves.toBe(false);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("the ACL predicate grants chapter *heads* only, never plain members", () => {
    const sql = jobAclVisibleSql(2, "$1");
    expect(sql).toContain("pc.role = 'head'");
    expect(sql).toContain("job_allowed_profiles");
    expect(sql).toContain("job_allowed_chapters");
  });

  it("filterViewableJobIds keeps only the ACL-granted ids for a recruiter", async () => {
    const db = fakeDb([[{ job_id: "job-1" }]]);
    const result = await filterViewableJobIds(
      db,
      access({ role: "recruiter" }),
      ["job-1", "job-2"],
    );
    expect([...result]).toEqual(["job-1"]);
  });

  it("filterViewableJobIds returns every id for HR without querying", async () => {
    const db = fakeDb();
    const result = await filterViewableJobIds(db, access({ role: "hr" }), [
      "job-1",
      "job-2",
    ]);
    expect(new Set(result)).toEqual(new Set(["job-1", "job-2"]));
    expect(db.query).not.toHaveBeenCalled();
  });
});
