import { describe, expect, it } from "vitest";

import type { StaffProfileAccess } from "@/lib/admin/profile-access";
import {
  canCancel,
  canEditHours,
  canManageInterviews,
  canReschedule,
  canSeeSession,
  type SessionAccessInfo,
} from "@/lib/calendar/authz";

function viewer(over: Partial<StaffProfileAccess> = {}): StaffProfileAccess {
  return {
    userId: "me",
    email: "me@example.com",
    username: "me",
    role: "none",
    isAdmin: false,
    isHr: false,
    isStaff: true,
    chapterIds: ["ch1"],
    headedChapterIds: [],
    ...over,
  };
}

const admin = viewer({ role: "admin", isAdmin: true, isHr: true });
const hr = viewer({ role: "hr", isHr: true });
const recruiter = viewer({ role: "recruiter" });
const chapterHead = viewer({ headedChapterIds: ["ch1"] });
const member = viewer();

const others: SessionAccessInfo = { createdBy: "someone", interviewerIds: ["u2"] };
const mine: SessionAccessInfo = { createdBy: "me", interviewerIds: ["u2"] };
const assigned: SessionAccessInfo = { createdBy: "someone", interviewerIds: ["me", "u2"] };

describe("canSeeSession", () => {
  it("lets HR and admin see any session", () => {
    expect(canSeeSession(admin, others, { canViewJob: false })).toBe(true);
    expect(canSeeSession(hr, others, { canViewJob: false })).toBe(true);
  });

  it("lets anyone with job view access see it", () => {
    expect(canSeeSession(member, others, { canViewJob: true })).toBe(true);
  });

  it("lets assigned interviewers and the organizer see it without a job grant", () => {
    expect(canSeeSession(member, assigned, { canViewJob: false })).toBe(true);
    expect(canSeeSession(member, mine, { canViewJob: false })).toBe(true);
  });

  it("hides it from everyone else", () => {
    expect(canSeeSession(member, others, { canViewJob: false })).toBe(false);
    expect(canSeeSession(chapterHead, others, { canViewJob: false })).toBe(false);
  });
});

describe("canReschedule (BR-07-01) / canCancel (BR-INT-01)", () => {
  it("allows admin, HR and recruiters on any session", () => {
    for (const v of [admin, hr, recruiter]) {
      expect(canManageInterviews(v)).toBe(true);
      expect(canReschedule(v, others)).toBe(true);
      expect(canCancel(v, others)).toBe(true);
    }
  });

  it("lets the organizer reschedule, but not cancel, their own session", () => {
    expect(canReschedule(member, mine)).toBe(true);
    expect(canReschedule(chapterHead, mine)).toBe(true);
    expect(canCancel(member, mine)).toBe(false);
    expect(canCancel(chapterHead, mine)).toBe(false);
  });

  it("denies chapter heads, even with the recruiter role", () => {
    expect(canReschedule(chapterHead, others)).toBe(false);
    expect(canCancel(chapterHead, others)).toBe(false);
    expect(canManageInterviews(viewer({ role: "recruiter", headedChapterIds: ["ch1"] }))).toBe(false);
  });

  it("still allows an HR user who also heads a chapter", () => {
    expect(canManageInterviews(viewer({ role: "hr", isHr: true, headedChapterIds: ["ch1"] }))).toBe(true);
  });

  it("denies an assigned interviewer", () => {
    expect(canReschedule(member, assigned)).toBe(false);
  });
});

describe("canEditHours", () => {
  it("allows HR (incl. admin) only", () => {
    expect(canEditHours(admin)).toBe(true);
    expect(canEditHours(hr)).toBe(true);
    expect(canEditHours(recruiter)).toBe(false);
    expect(canEditHours(chapterHead)).toBe(false);
  });
});
