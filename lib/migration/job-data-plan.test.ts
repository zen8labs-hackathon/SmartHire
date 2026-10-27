import { describe, expect, it, vi } from "vitest";

import type { QueryExecutor } from "@/lib/db/config/client";
import {
  applyDataPlan,
  buildDataPlan,
  matchReview,
  proposeHireType,
  type DataInputs,
} from "@/lib/migration/job-data-plan";

const d = (s: string) => new Date(s);
const empty: DataInputs = { hireType: null, schedules: [], seats: [], reviews: [] };
const sched = (id: string, over: Partial<DataInputs["schedules"][number]> = {}) => ({
  id, campaign_applied_id: "a1", scheduled_at: d("2026-01-10T09:00Z"), status: "Completed",
  location: null, mode: "online", meeting_link: null, ...over,
});
const seat = (scheduleId: string, profileId: string, at = "2026-01-10T09:00Z") => ({
  schedule_id: scheduleId, profile_id: profileId, campaign_applied_id: "a1", scheduled_at: d(at), status: "Completed",
});
const review = (id: string, over: Partial<DataInputs["reviews"][number]> = {}) => ({
  id, campaign_applied_id: "a1", created_by: null, created_at: d("2026-01-10T12:00Z"), ...over,
});

describe("proposeHireType", () => {
  it("maps Vietnamese and case variants, rejects unknown", () => {
    expect(proposeHireType("Tuyển mới")).toBe("New hire");
    expect(proposeHireType("  tuyển thay thế ".trim())).toBeNull(); // case differs from VI map
    expect(proposeHireType("replacement")).toBe("Replacement");
    expect(proposeHireType("Internal transfer")).toBeNull();
    expect(proposeHireType(null)).toBeNull();
  });
});

describe("buildDataPlan", () => {
  it("is clean with nothing to migrate", () => {
    const p = buildDataPlan(empty);
    expect(p.blockers).toEqual([]);
    expect(p.warnings.map((w) => w.code)).toContain("HIRE_TYPE_EMPTY");
  });

  it("blocks an unmappable hire type until HR picks one", () => {
    const inputs = { ...empty, hireType: "Khác" };
    expect(buildDataPlan(inputs).blockers.map((b) => b.code)).toEqual(["HIRE_TYPE_UNMAPPED"]);
    const ok = buildDataPlan(inputs, { hireType: "Replacement" });
    expect(ok.blockers).toEqual([]);
    expect(ok.hireType.final).toBe("Replacement");
  });

  it("requires review of location-without-link schedules, and only accepts proposed ids", () => {
    const inputs = { ...empty, schedules: [sched("1", { location: "HCM office" }), sched("2", { meeting_link: "https://m" })] };
    expect(buildDataPlan(inputs).blockers.map((b) => b.code)).toEqual(["MODE_REVIEW_REQUIRED"]);
    const ok = buildDataPlan(inputs, { officeScheduleIds: ["1"] });
    expect(ok.blockers).toEqual([]);
    expect(ok.mode.approvedOffice).toEqual(["1"]);
    expect(buildDataPlan(inputs, { officeScheduleIds: [] }).blockers).toEqual([]);
    expect(buildDataPlan(inputs, { officeScheduleIds: ["2"] }).blockers.map((b) => b.code)).toContain("MODE_UNKNOWN_SCHEDULE");
  });

  it("auto-matches a single seat and asks HR when ambiguous", () => {
    const one = buildDataPlan({ ...empty, seats: [seat("1", "u1")], reviews: [review("r1")] });
    expect(one.blockers).toEqual([]);
    expect(one.evaluations.marks).toEqual([{ scheduleId: "1", profileId: "u1", submittedAt: "2026-01-10T12:00:00.000Z" }]);

    const inputs = { ...empty, seats: [seat("1", "u1"), seat("1", "u2")], reviews: [review("r1")] };
    expect(buildDataPlan(inputs).blockers.map((b) => b.code)).toEqual(["EVALUATION_AMBIGUOUS"]);
    expect(buildDataPlan(inputs, { evaluationChoices: { r1: null } }).blockers).toEqual([]);
    const picked = buildDataPlan(inputs, { evaluationChoices: { r1: { scheduleId: "1", profileId: "u2" } } });
    expect(picked.evaluations.marks).toHaveLength(1);
    expect(picked.evaluations.marks[0].profileId).toBe("u2");
    const bad = buildDataPlan(inputs, { evaluationChoices: { r1: { scheduleId: "9", profileId: "u9" } } });
    expect(bad.blockers.map((b) => b.code)).toEqual(["EVALUATION_INVALID_CHOICE"]);
  });

  it("changes the fingerprint when decisions change", () => {
    const inputs = { ...empty, schedules: [sched("1", { location: "x" })] };
    expect(buildDataPlan(inputs, { officeScheduleIds: ["1"] }).fingerprint).not.toBe(
      buildDataPlan(inputs, { officeScheduleIds: [] }).fingerprint,
    );
  });
});

describe("matchReview", () => {
  it("prefers the reviewer's own seat and ignores seats after the review", () => {
    const seats = [seat("1", "u1"), seat("2", "u2"), seat("3", "u1", "2026-02-01T09:00Z")];
    const p = matchReview(review("r", { created_by: "u2" }), seats);
    expect(p.kind).toBe("auto");
    expect(p.seat).toEqual({ scheduleId: "2", profileId: "u2" });
    expect(matchReview(review("r"), [seat("3", "u1", "2026-02-01T09:00Z")]).kind).toBe("none");
  });
});

describe("applyDataPlan", () => {
  it("writes only resolved decisions", async () => {
    const query = vi.fn(async () => ({ rows: [{ "?column?": 1 }] }));
    const tx = { query } as unknown as QueryExecutor;
    const plan = buildDataPlan(
      { ...empty, hireType: "Tuyển mới", schedules: [sched("1", { location: "x" })], seats: [seat("5", "u1")], reviews: [review("r1")] },
      { officeScheduleIds: ["1"] },
    );
    const snap = await applyDataPlan(tx, "job", plan);
    expect(snap).toEqual({ previousHireType: "Tuyển mới", officeScheduleIds: ["1"], evaluationSeats: [{ scheduleId: "5", profileId: "u1" }] });
    const sqls = query.mock.calls.map((c) => (c as unknown as [string])[0]);
    expect(sqls.some((s) => s.includes("UPDATE jobs SET hire_type"))).toBe(true);
    expect(sqls.some((s) => s.includes("SET mode = 'office'"))).toBe(true);
  });
});
