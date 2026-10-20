import { describe, expect, it } from "vitest";

import { DEFAULT_WORKING_HOURS } from "@/lib/db/company-settings";
import type { BusyOccurrence } from "@/lib/calendar/expand";
import {
  checkConflicts,
  hasBlocking,
  suggestSlots,
  type CalendarSession,
  type ConflictContext,
  type ProposedSession,
} from "@/lib/calendar/conflicts";
import { fromLocal, isoWeekday } from "@/lib/calendar/time";

const NOW = fromLocal("2026-10-20", 480); // Tuesday 08:00 GMT+7
const DAY = "2026-10-21"; // Wednesday

function ctx(over: Partial<ConflictContext> = {}): ConflictContext {
  return {
    sessions: [],
    busy: [],
    hours: DEFAULT_WORKING_HOURS,
    now: NOW,
    people: { u1: { name: "An Nguyen", given: "An" } },
    ...over,
  };
}

function proposed(over: Partial<ProposedSession> = {}): ProposedSession {
  return {
    start: fromLocal(DAY, 600),
    durationMin: 60,
    interviewerIds: ["u1"],
    candidateKey: "c1",
    jobId: "j1",
    ...over,
  };
}

function session(over: Partial<CalendarSession> = {}): CalendarSession {
  return {
    id: "s1",
    start: fromLocal(DAY, 600),
    durationMin: 60,
    interviewerIds: ["u1"],
    candidateKey: "c2",
    jobId: "j2",
    status: "Scheduled",
    round: "Tech round",
    candidateName: "Binh Tran",
    ...over,
  };
}

function busy(over: Partial<BusyOccurrence> = {}): BusyOccurrence {
  return {
    blockId: "b1",
    ownerId: "u1",
    date: DAY,
    allDay: false,
    fromMin: 630,
    toMin: 690,
    note: null,
    ...over,
  };
}

const kinds = (q: ProposedSession, c: ConflictContext) => checkConflicts(q, c).map((i) => i.kind);

describe("checkConflicts", () => {
  it("returns nothing for a free slot in working hours", () => {
    expect(checkConflicts(proposed(), ctx())).toEqual([]);
  });

  it("flags past times as hard", () => {
    const [issue] = checkConflicts(proposed({ start: fromLocal("2026-10-19", 600) }), ctx());
    expect(issue).toMatchObject({ level: "hard", kind: "past" });
  });

  it("flags non-working days as soft without an outside-hours duplicate", () => {
    const issues = checkConflicts(proposed({ start: fromLocal("2026-10-24", 1200) }), ctx());
    expect(issues).toEqual([
      { level: "soft", kind: "hours", text: "Saturday is not a working day." },
    ]);
  });

  it("flags times outside working hours as soft", () => {
    const issues = checkConflicts(proposed({ start: fromLocal(DAY, 1020) }), ctx());
    expect(issues).toEqual([
      { level: "soft", kind: "hours", text: "Outside company working hours (08:30–17:30)." },
    ]);
  });

  it("flags overlapping timed busy blocks as hard", () => {
    const issues = checkConflicts(proposed(), ctx({ busy: [busy()] }));
    expect(issues).toEqual([
      {
        level: "hard",
        kind: "busy",
        who: "u1",
        text: "An Nguyen is busy 10:30–11:30. Only they can change their busy time.",
      },
    ]);
  });

  it("ignores busy blocks that only touch the edge, or belong to someone else", () => {
    const c = ctx({ busy: [busy({ fromMin: 660, toMin: 720 }), busy({ ownerId: "u2" })] });
    expect(kinds(proposed(), c)).toEqual([]);
  });

  it("flags all-day busy blocks", () => {
    const [issue] = checkConflicts(proposed(), ctx({ busy: [busy({ allDay: true, fromMin: null, toMin: null })] }));
    expect(issue.text).toBe("An Nguyen is busy all day. Only they can change their busy time.");
  });

  it("hides other interview details unless the job is visible", () => {
    const s = session({ start: fromLocal(DAY, 630) });
    const [hidden] = checkConflicts(proposed(), ctx({ sessions: [s] }));
    expect(hidden).toMatchObject({ level: "hard", kind: "iv" });
    expect(hidden.text).toBe("An Nguyen already has an interview at 10:30–11:30.");

    const [shown] = checkConflicts(proposed(), ctx({ sessions: [s], canSeeJob: () => true }));
    expect(shown.text).toBe("An Nguyen already has Tech round with Binh Tran at 10:30–11:30.");
  });

  it("falls back to a generic name for unknown interviewers", () => {
    const [issue] = checkConflicts(
      proposed({ interviewerIds: ["u9"] }),
      ctx({ sessions: [session({ interviewerIds: ["u9"] })] }),
    );
    expect(issue.text).toBe("This interviewer already has an interview at 10:00–11:00.");
  });

  it("ignores the excluded session and inactive statuses", () => {
    const c = ctx({
      sessions: [
        session({ id: "self" }),
        session({ id: "x1", status: "Canceled" }),
        session({ id: "x2", status: "Rescheduled" }),
        session({ id: "x3", status: "Completed" }),
      ],
    });
    expect(kinds(proposed({ excludeId: "self" }), c)).toEqual([]);
  });

  it("flags a buffer under 15 minutes as soft", () => {
    const s = session({ start: fromLocal(DAY, 670) }); // starts 10 min after ours ends
    expect(checkConflicts(proposed(), ctx({ sessions: [s] }))).toEqual([
      {
        level: "soft",
        kind: "buffer",
        who: "u1",
        text: "Less than 15 minutes between this and An’s interview at 11:10.",
      },
    ]);
  });

  it("allows exactly 15 minutes of buffer", () => {
    const s = session({ start: fromLocal(DAY, 675) });
    expect(kinds(proposed(), ctx({ sessions: [s] }))).toEqual([]);
  });

  it("adds an info note at four interviews that day", () => {
    const sessions = [510, 720, 840, 960].map((m, i) =>
      session({ id: `s${i}`, start: fromLocal(DAY, m), durationMin: 30 }),
    );
    const issues = checkConflicts(proposed(), ctx({ sessions }));
    expect(issues).toEqual([
      { level: "info", kind: "load", who: "u1", text: "An already has 4 interviews that day." },
    ]);
  });

  it("flags candidate overlaps in the same and in another position", () => {
    const same = session({ candidateKey: "c1", jobId: "j1", interviewerIds: ["u2"] });
    expect(checkConflicts(proposed(), ctx({ sessions: [same] }))).toEqual([
      { level: "hard", kind: "cand", text: "The candidate already has Tech round at 10:00." },
    ]);

    const other = session({ candidateKey: "c1", interviewerIds: ["u2"], round: null });
    expect(checkConflicts(proposed(), ctx({ sessions: [other] }))[0].text).toBe(
      "The candidate already has an interview at 10:00 in another position.",
    );
  });
});

describe("hasBlocking", () => {
  it("blocks on hard issues always and on soft issues until acknowledged", () => {
    const hard = [{ level: "hard", kind: "past", text: "" }] as const;
    const soft = [{ level: "soft", kind: "hours", text: "" }] as const;
    const info = [{ level: "info", kind: "load", text: "" }] as const;
    expect(hasBlocking([...hard], true)).toBe(true);
    expect(hasBlocking([...soft], false)).toBe(true);
    expect(hasBlocking([...soft], true)).toBe(false);
    expect(hasBlocking([...info], false)).toBe(false);
  });
});

describe("suggestSlots", () => {
  const q = { durationMin: 60, interviewerIds: ["u1"], candidateKey: "c1", jobId: "j1" };

  it("returns nothing without interviewers", () => {
    expect(suggestSlots({ ...q, interviewerIds: [] }, ctx())).toEqual([]);
  });

  it("suggests at most two future slots per working day", () => {
    const slots = suggestSlots(q, ctx(), 5);
    expect(slots).toHaveLength(5);
    expect(slots.map((s) => [s.date, s.startMin])).toEqual([
      ["2026-10-20", 510],
      ["2026-10-20", 630],
      ["2026-10-21", 510],
      ["2026-10-21", 630],
      ["2026-10-22", 510],
    ]);
    expect(slots[0].start).toEqual(fromLocal("2026-10-20", 510));
  });

  it("skips non-working days", () => {
    const slots = suggestSlots(q, ctx(), 20);
    expect(slots.every((s) => isoWeekday(s.date) <= 5)).toBe(true);
  });

  it("avoids busy time", () => {
    const c = ctx({
      now: fromLocal("2026-10-21", 480),
      busy: [busy({ fromMin: 480, toMin: 720 })],
    });
    const [first] = suggestSlots(q, c, 1);
    expect(first).toMatchObject({ date: DAY, startMin: 720 });
  });
});
