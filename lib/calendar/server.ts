/**
 * Server-side loaders shared by the Calendar API and the timeline route:
 * sessions with their interviewer seats, expanded busy time and the
 * conflict context for a proposed session.
 */

import type { StaffProfileAccess } from "@/lib/admin/profile-access";
import { filterViewableJobIds } from "@/lib/authz/can";
import { busyBlockFromRow, expandBusyBlocks, type BusyOccurrence } from "@/lib/calendar/expand";
import type { CalendarSession, ConflictContext, ConflictPerson } from "@/lib/calendar/conflicts";
import { addDays, fromLocal, isoDateInTz } from "@/lib/calendar/time";
import { listBusyBlocksByOwnersInRange } from "@/lib/db/busy-blocks";
import {
  listCalendarSessionsInRange,
  listInterviewersForSchedules,
  type CalendarScheduleRow,
  type CandidateScheduleInterviewerRow,
} from "@/lib/db/candidate-schedules";
import { getWorkingHours } from "@/lib/db/company-settings";
import type { QueryExecutor } from "@/lib/db/config/client";
import { getUsersByIds, type PublicUserRow } from "@/lib/db/users";

export const DEFAULT_DURATION_MIN = 60;

export type LoadedSession = {
  row: CalendarScheduleRow;
  seats: CandidateScheduleInterviewerRow[];
  /** Interviewers who have not declined. */
  activeInterviewerIds: string[];
};

export function sessionDuration(row: { duration_minutes: number | null }): number {
  return row.duration_minutes ?? DEFAULT_DURATION_MIN;
}

export function toCalendarSession(s: LoadedSession): CalendarSession {
  return {
    id: String(s.row.id),
    start: new Date(s.row.scheduled_at),
    durationMin: sessionDuration(s.row),
    interviewerIds: s.activeInterviewerIds,
    candidateKey: s.row.candidate_id,
    jobId: s.row.job_id ?? "",
    status: s.row.status,
    round: s.row.round_label,
    candidateName: s.row.candidate_name,
  };
}

/** Active sessions starting in `[from, to)` with their interviewer seats. */
export async function loadSessions(
  db: QueryExecutor,
  from: Date,
  to: Date,
  profileIds?: string[],
): Promise<LoadedSession[]> {
  const rows = await listCalendarSessionsInRange(db, from, to, profileIds);
  const seats = await listInterviewersForSchedules(
    db,
    rows.map((r) => String(r.id)),
  );
  const bySchedule = new Map<string, CandidateScheduleInterviewerRow[]>();
  for (const seat of seats) {
    const key = String(seat.schedule_id);
    const list = bySchedule.get(key) ?? [];
    list.push(seat);
    bySchedule.set(key, list);
  }
  return rows.map((row) => {
    const mine = bySchedule.get(String(row.id)) ?? [];
    return {
      row,
      seats: mine,
      activeInterviewerIds: mine.filter((x) => !x.declined_at).map((x) => x.profile_id),
    };
  });
}

/** Busy occurrences of these owners between two inclusive ISO dates. */
export async function loadBusy(
  db: QueryExecutor,
  ownerIds: string[],
  fromDate: string,
  toDate: string,
): Promise<BusyOccurrence[]> {
  const rows = await listBusyBlocksByOwnersInRange(db, ownerIds, fromDate, toDate);
  return expandBusyBlocks(rows.map(busyBlockFromRow), fromDate, toDate);
}

/** The `[start, end)` instants of a busy occurrence; all-day covers the whole day. */
export function busyRange(o: BusyOccurrence): { start: Date; end: Date } {
  if (o.allDay || o.fromMin === null || o.toMin === null) {
    return { start: fromLocal(o.date, 0), end: fromLocal(addDays(o.date, 1), 0) };
  }
  return { start: fromLocal(o.date, o.fromMin), end: fromLocal(o.date, o.toMin) };
}

/**
 * Upcoming sessions the owner organizes or interviews in (without having
 * declined) that overlap any of these busy occurrences.
 */
export async function busyOverlaps(
  db: QueryExecutor,
  ownerId: string,
  occurrences: BusyOccurrence[],
  now: Date = new Date(),
): Promise<LoadedSession[]> {
  if (occurrences.length === 0) return [];
  const ranges = occurrences.map(busyRange);
  const from = new Date(
    Math.max(now.getTime(), Math.min(...ranges.map((r) => r.start.getTime()))),
  );
  const to = new Date(Math.max(...ranges.map((r) => r.end.getTime())));
  if (from >= to) return [];
  const sessions = await loadSessions(db, from, to, [ownerId]);
  return sessions.filter((s) => {
    if (s.row.created_by !== ownerId && !s.activeInterviewerIds.includes(ownerId)) {
      return false;
    }
    const start = new Date(s.row.scheduled_at).getTime();
    const end = start + sessionDuration(s.row) * 60_000;
    return ranges.some((r) => start < r.end.getTime() && r.start.getTime() < end);
  });
}

export function displayName(u: Pick<PublicUserRow, "username" | "email">): string {
  return u.username?.trim() || u.email;
}

export function conflictPeople(users: PublicUserRow[]): Record<string, ConflictPerson> {
  const out: Record<string, ConflictPerson> = {};
  for (const u of users) {
    const name = displayName(u);
    out[u.id] = { name, given: name.split(/\s+/)[0] ?? name };
  }
  return out;
}

/**
 * Everything {@link checkConflicts} needs around `start`: the interviewers'
 * sessions, the candidate's sessions and busy time over the surrounding days.
 */
export async function loadConflictContext(
  db: QueryExecutor,
  access: StaffProfileAccess,
  input: { start: Date; interviewerIds: string[]; candidateId: string },
  now: Date = new Date(),
): Promise<ConflictContext> {
  const date = isoDateInTz(input.start);
  const from = fromLocal(addDays(date, -1), 0);
  const to = fromLocal(addDays(date, 2), 0);

  const [sessions, busy, hours, users] = await Promise.all([
    loadSessions(db, from, to),
    loadBusy(db, input.interviewerIds, addDays(date, -1), addDays(date, 1)),
    getWorkingHours(db),
    getUsersByIds(db, input.interviewerIds),
  ]);

  const relevant = sessions.filter(
    (s) =>
      s.row.candidate_id === input.candidateId ||
      s.activeInterviewerIds.some((id) => input.interviewerIds.includes(id)),
  );
  const viewable = await filterViewableJobIds(
    db,
    access,
    relevant.map((s) => s.row.job_id),
  );

  return {
    sessions: relevant.map(toCalendarSession),
    busy,
    hours,
    now,
    people: conflictPeople(users),
    canSeeJob: (jobId) => viewable.has(jobId === "" ? null : jobId),
  };
}
