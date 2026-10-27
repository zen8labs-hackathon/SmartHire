import { describe, expect, it } from "vitest";

import { STAGES, type Candidate, type Role, type RoleKey } from "@/app/admin/position-management-2/data";
import { nextStep } from "@/app/admin/position-management-2/nextstep";

const role = (key: RoleKey): Role => ({
  key,
  name: key,
  role: key,
  salary: false,
  canCreate: key === "hr",
  canDecide: key === "hr" || key === "ch",
});

const cand = (over: Partial<Candidate> = {}): Candidate =>
  ({
    id: 1,
    name: "A",
    headline: "",
    stage: "iv",
    sub: "New",
    st: "done",
    source: "",
    owner: "",
    applied: "",
    days: 0,
    salary: "",
    round: "Interview 1",
    ...over,
  }) as Candidate;

const acts = (key: RoleKey, c: Candidate, sched?: { d: string; past?: boolean; noShow?: boolean; done?: boolean } | null) =>
  nextStep(c, role(key), STAGES, { sched }).acts.map((a) => a.t);

describe("nextStep — interview stage (BR-INT-01/03/09/10)", () => {
  it("BR-INT-01: only HR and Recruiter can schedule; Chapter Head cannot", () => {
    expect(acts("hr", cand())).toContain("sched");
    expect(acts("rc", cand())).toContain("sched");
    expect(acts("ch", cand())).not.toContain("sched");
    expect(acts("iv", cand())).not.toContain("sched");
    expect(nextStep(cand(), role("hr"), STAGES, {}).title).toBe("Schedule Interview 1");
  });

  it("BR-INT-01: only HR and Recruiter can reschedule an upcoming session", () => {
    const up = { d: "Tomorrow 10:00", past: false };
    expect(acts("hr", cand(), up)).toContain("resched");
    expect(acts("rc", cand(), up)).toContain("resched");
    expect(acts("ch", cand(), up)).not.toContain("resched");
  });

  it("BR-INT-03: after Pass, HR/RC get 'Schedule Interview 2'; CH does not", () => {
    const c = cand({ sub: "Passed" });
    expect(acts("hr", c)).toContain("nextRound");
    expect(acts("rc", c)).toContain("nextRound");
    expect(acts("ch", c)).not.toContain("nextRound");
    const label = nextStep(c, role("hr"), STAGES, {}).acts.find((a) => a.t === "nextRound")?.label;
    expect(label).toBe("Schedule Interview 2");
  });

  it("BR-INT-03: notes in + Consider → CH only decides, HR/RC schedule the next round", () => {
    const c = cand({ sub: "Consider", ivDone: true });
    const done = { d: "Yesterday", past: true };
    const ch = acts("ch", c, done);
    expect(ch).not.toContain("nextRound");
    expect(ch).toContain("move");
    expect(acts("hr", c, done)).toContain("nextRound");
    expect(acts("rc", c, done)).toContain("nextRound");
  });

  it("BR-INT-10: a no-show session falls back to scheduling the same round", () => {
    const ns = nextStep(cand(), role("hr"), STAGES, { sched: { d: "Yesterday", past: true, noShow: true } });
    expect(ns.title).toBe("No-show · Schedule Interview 1");
    expect(ns.acts.map((a) => a.t)).toContain("sched");
  });

  it("BR-INT-09: a started session without notes offers 'Mark no-show' to HR/RC/IV, not CH", () => {
    const started = { d: "Today 09:00", past: true, done: false };
    expect(acts("hr", cand(), started)).toContain("noShow");
    expect(acts("rc", cand(), started)).toContain("noShow");
    expect(acts("iv", cand(), started)).toContain("noShow");
    expect(acts("ch", cand(), started)).not.toContain("noShow");
  });

  it("BR-INT-07: a Completed session counts as notes in (no no-show, CH decides)", () => {
    const done = { d: "Yesterday", past: true, done: true };
    expect(acts("hr", cand(), done)).not.toContain("noShow");
    expect(acts("ch", cand(), done)).toContain("move");
  });

  it("BR-INT-09: no no-show before the session starts", () => {
    expect(acts("hr", cand(), { d: "Tomorrow", past: false })).not.toContain("noShow");
  });
});
