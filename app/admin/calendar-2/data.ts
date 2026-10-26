/**
 * Calendar client model: types mirroring the calendar API, GMT+7 display
 * helpers and thin wrappers over the shared conflict engine. Dates are ISO
 * `YYYY-MM-DD` in GMT+7; times of day are minutes since midnight.
 */
import {
  checkConflicts,
  hasBlocking,
  suggestSlots,
  type CalendarSession,
  type ConflictContext,
  type ConflictIssue,
  type ConflictPerson,
  type ProposedSession,
  type SuggestedSlot,
} from "@/lib/calendar/conflicts";
import type { BusyOccurrence } from "@/lib/calendar/expand";
import {
  addDays,
  diffDays,
  fmtMin,
  fromLocal,
  isoDateInTz,
  isoWeekday,
  minuteOfDayInTz,
  todayInTz,
  weekStart,
  weekdayName,
} from "@/lib/calendar/time";
import type { BusyBlockRepeat } from "@/lib/db/busy-blocks";
import type {
  CandidateScheduleMode,
  CandidateScheduleStatus,
} from "@/lib/db/candidate-schedules";
import type { WorkingHours } from "@/lib/db/company-settings";

export {
  addDays,
  diffDays,
  fmtMin,
  fromLocal,
  hasBlocking,
  isoDateInTz,
  isoWeekday,
  minuteOfDayInTz,
  todayInTz,
  weekStart,
  weekdayName,
};
export type { BusyBlockRepeat, BusyOccurrence, SuggestedSlot };

export type Hours = WorkingHours;
export type Issue = ConflictIssue;
export type SessionStatus = CandidateScheduleStatus;
export type SessionMode = CandidateScheduleMode;
export type BusyScope = "day" | "series" | "following";
export type OnOverlap = "keep" | "ask";

export type Person = { id: string; name: string; email: string; role: string };

export type PersonResult = Person & { chapterIds: string[]; sameChapter: boolean; onPosition?: boolean };

export type Seat = {
  id: string;
  declinedAt: string | null;
  declineReason: string | null;
  submitted: boolean;
};

export type Session = {
  id: string;
  start: Date;
  end: Date;
  /** GMT+7 date and minute-of-day of `start`. */
  date: string;
  startMin: number;
  durationMin: number;
  round: string | null;
  status: SessionStatus;
  mode: SessionMode | null;
  location: string | null;
  meetingLink: string | null;
  note: string | null;
  campaignAppliedId: string;
  candidateId: string | null;
  candidateName: string | null;
  jobId: string | null;
  organizerId: string;
  interviewers: Seat[];
  noInterviewer: boolean;
  canEdit: boolean;
  /** Viewer only sits on this session; job details are withheld. */
  limited: boolean;
};

export type LaneItem = { kind: "interview" | "busy"; start: Date; end: Date };

export type CalendarFeed = {
  range: { from: string; to: string };
  hours: Hours;
  me: string;
  people: Person[];
  sessions: Session[];
  /** The viewer's own busy occurrences. */
  busy: BusyOccurrence[];
  /** Reduced availability of the people overlaid next to the viewer. */
  lanes: Record<string, LaneItem[]>;
  /** The viewer's scheduled interviews in the next 90 days, regardless of range. */
  upcomingCount: number;
};

export type BusyBlock = {
  id: string;
  ownerId: string;
  startDate: string;
  allDay: boolean;
  fromMin: number | null;
  toMin: number | null;
  repeat: BusyBlockRepeat;
  untilDate: string | null;
  days: number[];
  note: string | null;
  removedDates: string[];
  seriesParentId: string | null;
};

/** A session that overlaps a busy block being saved. */
export type BusyOverlap = {
  id: string;
  start: Date;
  end: Date;
  round: string | null;
  candidateName: string | null;
  organizerId: string;
};

export type ScheduleInput = {
  scheduledAt: Date;
  roundLabel?: string;
  durationMinutes?: number;
  location?: string | null;
  /** Omit to create a new round. */
  scheduleId?: string;
  interviewerIds?: string[];
  mode?: SessionMode;
  meetingLink?: string | null;
  note?: string | null;
  /** Required when the time of an existing round changes. */
  reason?: string;
  acknowledgeSoft?: boolean;
};

export const STATUS_LABEL: Record<SessionStatus, string> = {
  Scheduled: "Scheduled",
  Confirmed: "Confirmed",
  Rescheduled: "Rescheduled",
  Canceled: "Cancelled",
  Completed: "Completed",
  NoShow: "No-show",
};

const UPCOMING: ReadonlySet<SessionStatus> = new Set(["Scheduled", "Confirmed"]);

/** Still ahead and changeable (not completed, canceled or a no-show). */
export function isUpcoming(s: Session, now: Date = new Date()): boolean {
  return UPCOMING.has(s.status) && s.start.getTime() > now.getTime();
}

export function seatOf(s: Session, personId: string): Seat | undefined {
  return s.interviewers.find((x) => x.id === personId);
}

/** Interviewers who have not declined. */
export function activeInterviewerIds(s: Session): string[] {
  return s.interviewers.filter((x) => x.declinedAt === null).map((x) => x.id);
}

// ---------------------------------------------------------------------------
// Display helpers (ISO dates, GMT+7)

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}

/** `Mon` */
export function dayShort(date: string): string {
  return weekdayName(date).slice(0, 3);
}

/** Day of month, e.g. `20`. */
export function dayNum(date: string): number {
  return parts(date).d;
}

/** `Oct` */
export function mon(date: string): string {
  return MONTHS[parts(date).m - 1];
}

/** `Tuesday, 20 Oct` */
export function dayLong(date: string): string {
  return `${weekdayName(date)}, ${dayNum(date)} ${mon(date)}`;
}

/** `20 Oct – 26 Oct 2026`, collapsing the shared month. */
export function rangeLabel(from: string, to: string): string {
  const a = parts(from);
  const b = parts(to);
  if (from === to) return `${dayLong(from)} ${a.y}`;
  const left = a.m === b.m && a.y === b.y ? `${a.d}` : `${a.d} ${mon(from)}`;
  return `${left} – ${b.d} ${mon(to)} ${b.y}`;
}

export function isWorkingDay(date: string, hours: Hours): boolean {
  return hours.days.includes(isoWeekday(date));
}

/** `09:00–10:00` */
export function timeRange(startMin: number, durationMin: number): string {
  return `${fmtMin(startMin)}–${fmtMin(Math.min(startMin + durationMin, 24 * 60))}`;
}

export function givenName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

// ---------------------------------------------------------------------------
// Conflict engine wrappers

export function toCalendarSession(s: Session): CalendarSession {
  return {
    id: s.id,
    start: s.start,
    durationMin: s.durationMin,
    interviewerIds: activeInterviewerIds(s),
    candidateKey: s.candidateId ?? s.campaignAppliedId,
    jobId: s.jobId ?? "",
    status: s.status,
    round: s.round,
    candidateName: s.candidateName,
  };
}

function laneBusy(ownerId: string, item: LaneItem, i: number): BusyOccurrence {
  const date = isoDateInTz(item.start);
  const fromMin = minuteOfDayInTz(item.start);
  const toMin = isoDateInTz(item.end) === date ? minuteOfDayInTz(item.end) : 24 * 60;
  return {
    blockId: `lane:${ownerId}:${i}`,
    ownerId,
    date,
    allDay: fromMin === 0 && toMin === 24 * 60,
    fromMin,
    toMin,
    note: null,
  };
}

/**
 * Conflict context from a feed. Overlaid people's lanes stand in for sessions
 * and busy time the viewer cannot see; lane interviews already present as a
 * visible session are skipped so they are not reported twice.
 */
export function conflictContext(
  feed: CalendarFeed,
  opts: { now?: Date; canSeeJob?: (jobId: string) => boolean } = {},
): ConflictContext {
  const sessions = feed.sessions.map(toCalendarSession);
  const busy = [...feed.busy];

  for (const [personId, lane] of Object.entries(feed.lanes)) {
    lane.forEach((item, i) => {
      if (item.kind === "busy") {
        busy.push(laneBusy(personId, item, i));
        return;
      }
      const seen = feed.sessions.some(
        (s) =>
          s.start.getTime() === item.start.getTime() &&
          s.end.getTime() === item.end.getTime() &&
          (s.organizerId === personId || activeInterviewerIds(s).includes(personId)),
      );
      if (seen) return;
      sessions.push({
        id: `lane:${personId}:${i}`,
        start: item.start,
        durationMin: Math.round((item.end.getTime() - item.start.getTime()) / 60_000),
        interviewerIds: [personId],
        candidateKey: "",
        jobId: "",
        status: "Scheduled",
      });
    });
  }

  const people: Record<string, ConflictPerson> = {};
  for (const p of feed.people) people[p.id] = { name: p.name, given: givenName(p.name) };

  const visibleJobs = new Set(
    feed.sessions.filter((s) => !s.limited && s.jobId).map((s) => s.jobId as string),
  );

  return {
    sessions,
    busy,
    hours: feed.hours,
    now: opts.now ?? new Date(),
    people,
    canSeeJob: opts.canSeeJob ?? ((jobId) => visibleJobs.has(jobId)),
  };
}

export type Query = ProposedSession;

export function check(q: Query, ctx: ConflictContext): Issue[] {
  return checkConflicts(q, ctx);
}

export function suggest(
  q: Omit<Query, "start">,
  ctx: ConflictContext,
  n?: number,
): SuggestedSlot[] {
  return suggestSlots(q, ctx, n);
}
