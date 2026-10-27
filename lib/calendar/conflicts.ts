/**
 * Interview scheduling conflict checks, shared by the Calendar UI and the
 * server. Hard issues block saving; soft issues block until the organizer
 * acknowledges them; info issues never block.
 */

import type { WorkingHours } from "@/lib/db/company-settings";
import type { BusyOccurrence } from "@/lib/calendar/expand";
import {
  addDays,
  fmtMin,
  fromLocal,
  isoDateInTz,
  isoWeekday,
  minuteOfDayInTz,
  todayInTz,
  weekdayName,
} from "@/lib/calendar/time";

export type ConflictLevel = "hard" | "soft" | "info";
export type ConflictKind = "past" | "busy" | "iv" | "cand" | "hours" | "buffer" | "load";

export type ConflictIssue = {
  level: ConflictLevel;
  kind: ConflictKind;
  /** Interviewer the issue is about, when it is about one person. */
  who?: string;
  text: string;
};

export type CalendarSession = {
  id: string;
  start: Date;
  durationMin: number;
  interviewerIds: string[];
  /** Identifies the candidate across positions (e.g. candidate id). */
  candidateKey: string;
  jobId: string;
  status: string;
  round?: string | null;
  candidateName?: string | null;
};

export type ProposedSession = {
  start: Date;
  durationMin: number;
  interviewerIds: string[];
  candidateKey: string;
  jobId: string;
  /** Session being rescheduled; ignored when checking overlaps. */
  excludeId?: string;
};

export type ConflictPerson = { name: string; given: string };

export type ConflictContext = {
  sessions: CalendarSession[];
  busy: BusyOccurrence[];
  hours: WorkingHours;
  now: Date;
  people?: Record<string, ConflictPerson>;
  /** Whether the viewer may see the job of another session. */
  canSeeJob?: (jobId: string) => boolean;
};

export type SuggestedSlot = { date: string; startMin: number; start: Date };

const ACTIVE_STATUSES = new Set(["Scheduled", "Confirmed"]);
const BUFFER_MIN = 15;
const LOAD_LIMIT = 4;
const SUGGEST_DAYS = 14;
const SUGGEST_PER_DAY = 2;
const SLOT_STEP = 30;
const SLOT_GAP = 90;

const MS_PER_MIN = 60_000;

function endOf(start: Date, durationMin: number): Date {
  return new Date(start.getTime() + durationMin * MS_PER_MIN);
}

function overlaps(a1: number, a2: number, b1: number, b2: number): boolean {
  return a1 < b2 && b1 < a2;
}

export function checkConflicts(q: ProposedSession, ctx: ConflictContext): ConflictIssue[] {
  const issues: ConflictIssue[] = [];
  const date = isoDateInTz(q.start);
  const s = minuteOfDayInTz(q.start);
  const e = s + q.durationMin;
  const qs = q.start.getTime();
  const qe = endOf(q.start, q.durationMin).getTime();
  const workingDay = ctx.hours.days.includes(isoWeekday(date));

  const active = ctx.sessions.filter(
    (x) => ACTIVE_STATUSES.has(x.status) && x.id !== q.excludeId,
  );

  if (qs < ctx.now.getTime()) {
    issues.push({ level: "hard", kind: "past", text: "This time is in the past." });
  }
  if (!workingDay) {
    issues.push({
      level: "soft",
      kind: "hours",
      text: `${weekdayName(date)} is not a working day.`,
    });
  }

  for (const id of q.interviewerIds) {
    const person = ctx.people?.[id];
    const name = person?.name ?? "This interviewer";
    const given = person?.given ?? name;

    for (const b of ctx.busy) {
      if (b.ownerId !== id || b.date !== date) continue;
      if (!b.allDay && !overlaps(s, e, b.fromMin ?? 0, b.toMin ?? 0)) continue;
      const when = b.allDay ? "all day" : `${fmtMin(b.fromMin!)}–${fmtMin(b.toMin!)}`;
      issues.push({
        level: "hard",
        kind: "busy",
        who: id,
        text: `${name} is busy ${when}. Only they can change their busy time.`,
      });
    }

    const mine = active.filter((x) => x.interviewerIds.includes(id));
    for (const x of mine) {
      const xs = x.start.getTime();
      const xe = endOf(x.start, x.durationMin).getTime();
      const xStartMin = minuteOfDayInTz(x.start);
      if (overlaps(qs, qe, xs, xe)) {
        const what =
          ctx.canSeeJob?.(x.jobId) && x.round
            ? `${x.round} with ${x.candidateName ?? "a candidate"}`
            : "an interview";
        issues.push({
          level: "hard",
          kind: "iv",
          who: id,
          text: `${name} already has ${what} at ${fmtMin(xStartMin)}–${fmtMin(minuteOfDayInTz(new Date(xe)))}.`,
        });
        continue;
      }
      const gap = xs >= qe ? (xs - qe) / MS_PER_MIN : (qs - xe) / MS_PER_MIN;
      if (gap < BUFFER_MIN) {
        issues.push({
          level: "soft",
          kind: "buffer",
          who: id,
          text: `Less than 15 minutes between this and ${given}’s interview at ${fmtMin(xStartMin)}.`,
        });
      }
    }

    const sameDay = mine.filter((x) => isoDateInTz(x.start) === date).length;
    if (sameDay >= LOAD_LIMIT) {
      issues.push({
        level: "info",
        kind: "load",
        who: id,
        text: `${given} already has ${sameDay} interviews that day.`,
      });
    }
  }

  if (workingDay && (s < ctx.hours.start || e > ctx.hours.end)) {
    issues.push({
      level: "soft",
      kind: "hours",
      text: `Outside company working hours (${fmtMin(ctx.hours.start)}–${fmtMin(ctx.hours.end)}).`,
    });
  }

  for (const x of active) {
    if (x.candidateKey !== q.candidateKey) continue;
    if (!overlaps(qs, qe, x.start.getTime(), endOf(x.start, x.durationMin).getTime())) continue;
    const otherJob = x.jobId !== q.jobId;
    issues.push({
      level: "hard",
      kind: "cand",
      text: `The candidate already has ${x.round ?? "an interview"} at ${fmtMin(minuteOfDayInTz(x.start))}${otherJob ? " in another position." : "."}`,
    });
  }

  return issues;
}

/** True when the issues prevent saving. */
export function hasBlocking(issues: ConflictIssue[], acknowledgeSoft: boolean): boolean {
  return issues.some((i) => i.level === "hard" || (i.level === "soft" && !acknowledgeSoft));
}

/**
 * Up to `n` conflict-free slots over the next two weeks, at most two per
 * working day, spaced at least two hours apart.
 */
export function suggestSlots(
  q: Omit<ProposedSession, "start">,
  ctx: ConflictContext,
  n = 5,
): SuggestedSlot[] {
  if (q.interviewerIds.length === 0) return [];
  const out: SuggestedSlot[] = [];
  const today = todayInTz(ctx.now);
  const first = Math.ceil(ctx.hours.start / SLOT_STEP) * SLOT_STEP;

  for (let i = 0; i < SUGGEST_DAYS && out.length < n; i++) {
    const date = addDays(today, i);
    if (!ctx.hours.days.includes(isoWeekday(date))) continue;
    let perDay = 0;
    for (
      let m = first;
      m + q.durationMin <= ctx.hours.end && perDay < SUGGEST_PER_DAY && out.length < n;
      m += SLOT_STEP
    ) {
      const start = fromLocal(date, m);
      const issues = checkConflicts({ ...q, start }, ctx);
      if (issues.some((x) => x.level !== "info")) continue;
      out.push({ date, startMin: m, start });
      perDay++;
      m += SLOT_GAP;
    }
  }
  return out;
}
