/**
 * Calendar API client. Every call throws an `Error` carrying the server's
 * `{error}` message, except `saveSchedule`, which returns blocking conflicts
 * (409) as a value so the dialog can show them.
 */
import {
  isoDateInTz,
  minuteOfDayInTz,
  type BusyBlock,
  type BusyBlockRepeat,
  type BusyOverlap,
  type BusyScope,
  type CalendarFeed,
  type Hours,
  type Issue,
  type LaneItem,
  type OnOverlap,
  type PersonResult,
  type ScheduleInput,
  type Seat,
  type Session,
} from "./data";

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    return ((await res.json()) as { error?: string }).error ?? fallback;
  } catch {
    return fallback;
  }
}

const JSON_HEADERS = { "Content-Type": "application/json" };

async function request<T>(
  url: string,
  init: RequestInit & { fallback: string },
): Promise<T> {
  const { fallback, ...rest } = init;
  const res = await fetch(url, rest);
  if (!res.ok) throw new Error(await readError(res, fallback));
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Feed

type ApiSession = Omit<Session, "start" | "end" | "date" | "startMin"> & {
  start: string;
  end: string;
};

type ApiLaneItem = { kind: LaneItem["kind"]; start: string; end: string };

type ApiFeed = Omit<CalendarFeed, "sessions" | "lanes"> & {
  sessions: ApiSession[];
  lanes: Record<string, ApiLaneItem[]>;
};

function toSession(s: ApiSession): Session {
  const start = new Date(s.start);
  return {
    ...s,
    start,
    end: new Date(s.end),
    date: isoDateInTz(start),
    startMin: minuteOfDayInTz(start),
  };
}

function toLane(items: ApiLaneItem[]): LaneItem[] {
  return items.map((x) => ({ kind: x.kind, start: new Date(x.start), end: new Date(x.end) }));
}

export async function fetchCalendar(
  q: { from: string; to: string; people?: string[] },
  signal?: AbortSignal,
): Promise<CalendarFeed> {
  const params = new URLSearchParams({ from: q.from, to: q.to });
  if (q.people?.length) params.set("people", q.people.join(","));
  const raw = await request<ApiFeed>(`/api/admin/calendar?${params}`, {
    signal,
    cache: "no-store",
    fallback: "Could not load the calendar.",
  });
  const lanes: Record<string, LaneItem[]> = {};
  for (const [id, items] of Object.entries(raw.lanes)) lanes[id] = toLane(items);
  return { ...raw, sessions: raw.sessions.map(toSession), lanes };
}

export async function searchPeople(
  q: string,
  signal?: AbortSignal,
  scope?: { campaignAppliedId?: string; jobId?: string },
): Promise<PersonResult[]> {
  const params = new URLSearchParams({ q });
  if (scope?.campaignAppliedId) params.set("campaignAppliedId", scope.campaignAppliedId);
  if (scope?.jobId) params.set("jobId", scope.jobId);
  const data = await request<{ people: PersonResult[] }>(
    `/api/admin/calendar/people?${params}`,
    { signal, fallback: "Could not search people." },
  );
  return data.people;
}

// ---------------------------------------------------------------------------
// Working hours

export async function fetchHours(signal?: AbortSignal): Promise<Hours> {
  const data = await request<{ hours: Hours }>("/api/admin/calendar/hours", {
    signal,
    fallback: "Could not load working hours.",
  });
  return data.hours;
}

export async function saveHours(hours: Hours): Promise<Hours> {
  const data = await request<{ hours: Hours }>("/api/admin/calendar/hours", {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify(hours),
    fallback: "Could not save working hours.",
  });
  return data.hours;
}

// ---------------------------------------------------------------------------
// Busy blocks

export type BusyShape = {
  startDate: string;
  allDay?: boolean;
  fromMin?: number | null;
  toMin?: number | null;
  repeat?: BusyBlockRepeat;
  untilDate?: string | null;
  /** ISO weekdays (1=Mon..7=Sun) of a weekly repeat. */
  days?: number[];
  note?: string | null;
};

type ApiOverlap = Omit<BusyOverlap, "start" | "end"> & { start: string; end: string };

function toOverlaps(xs: ApiOverlap[]): BusyOverlap[] {
  return xs.map((x) => ({ ...x, start: new Date(x.start), end: new Date(x.end) }));
}

export async function createBusy(
  input: BusyShape & { onOverlap?: OnOverlap },
): Promise<{ block: BusyBlock; overlaps: BusyOverlap[] }> {
  const data = await request<{ block: BusyBlock; overlaps: ApiOverlap[] }>(
    "/api/admin/calendar/busy",
    {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
      fallback: "Could not save busy time.",
    },
  );
  return { block: data.block, overlaps: toOverlaps(data.overlaps) };
}

/** Upcoming interviews a busy shape would overlap across its whole repeat range. */
export async function previewBusyOverlaps(input: BusyShape): Promise<BusyOverlap[]> {
  const data = await request<{ overlaps: ApiOverlap[] }>("/api/admin/calendar/busy/preview", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
    fallback: "Could not check overlaps.",
  });
  return toOverlaps(data.overlaps);
}

export async function fetchBusy(id: string): Promise<BusyBlock> {
  const data = await request<{ block: BusyBlock }>(
    `/api/admin/calendar/busy/${encodeURIComponent(id)}`,
    { fallback: "Could not load busy time." },
  );
  return data.block;
}

/** `date` names the occurrence for `day` and `following` scopes. */
export async function updateBusy(
  id: string,
  input: Partial<BusyShape> & { scope?: BusyScope; date?: string; onOverlap?: OnOverlap },
): Promise<{ blocks: BusyBlock[]; overlaps: BusyOverlap[] }> {
  const data = await request<{ blocks: BusyBlock[]; overlaps: ApiOverlap[] }>(
    `/api/admin/calendar/busy/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
      fallback: "Could not update busy time.",
    },
  );
  return { blocks: data.blocks, overlaps: toOverlaps(data.overlaps) };
}

/** Returns the block that remains (trimmed series), or null when it is gone. */
export async function deleteBusy(
  id: string,
  opts: { scope?: BusyScope; date?: string } = {},
): Promise<BusyBlock | null> {
  const params = new URLSearchParams();
  if (opts.scope) params.set("scope", opts.scope);
  if (opts.date) params.set("date", opts.date);
  const qs = params.size ? `?${params}` : "";
  const data = await request<{ ok: true; block: BusyBlock | null }>(
    `/api/admin/calendar/busy/${encodeURIComponent(id)}${qs}`,
    { method: "DELETE", fallback: "Could not remove busy time." },
  );
  return data.block;
}

// ---------------------------------------------------------------------------
// Interviewer response

export type DeclineResult = {
  seat: Pick<Seat, "id" | "declinedAt" | "declineReason"> | null;
  noInterviewer: boolean;
};

export async function declineSession(sessionId: string, reason?: string): Promise<DeclineResult> {
  return request<DeclineResult>(
    `/api/admin/calendar/sessions/${encodeURIComponent(sessionId)}/decline`,
    {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(reason ? { reason } : {}),
      fallback: "Could not decline the interview.",
    },
  );
}

export async function withdrawDecline(sessionId: string): Promise<DeclineResult> {
  return request<DeclineResult>(
    `/api/admin/calendar/sessions/${encodeURIComponent(sessionId)}/decline`,
    { method: "DELETE", fallback: "Could not withdraw your decline." },
  );
}

// ---------------------------------------------------------------------------
// Scheduling (candidate timeline)

export type SaveScheduleResult =
  | { ok: true; scheduleId: string; issues: Issue[] }
  | { ok: false; issues: Issue[] };

/** Create a round (no `scheduleId`) or edit/reschedule one. */
export async function saveSchedule(
  campaignAppliedId: string,
  input: ScheduleInput,
): Promise<SaveScheduleResult> {
  const { scheduledAt, ...rest } = input;
  const res = await fetch(`/api/admin/candidates/${encodeURIComponent(campaignAppliedId)}/timeline`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify({ ...rest, scheduledAt: scheduledAt.toISOString(), strict: true }),
  });
  if (res.status === 409) {
    const body = (await res.json().catch(() => ({}))) as { issues?: Issue[]; error?: string };
    if (body.issues) return { ok: false, issues: body.issues };
    throw new Error(body.error ?? "Could not save the interview.");
  }
  if (!res.ok) throw new Error(await readError(res, "Could not save the interview."));
  const data = (await res.json()) as { schedule: { id: string | number }; issues?: Issue[] };
  return { ok: true, scheduleId: String(data.schedule.id), issues: data.issues ?? [] };
}

export async function cancelSchedule(
  campaignAppliedId: string,
  scheduleId: string,
  reason: string,
): Promise<void> {
  await request<{ schedule: unknown }>(
    `/api/admin/candidates/${encodeURIComponent(campaignAppliedId)}/timeline`,
    {
      method: "DELETE",
      headers: JSON_HEADERS,
      body: JSON.stringify({ scheduleId, reason }),
      fallback: "Could not cancel the interview.",
    },
  );
}
