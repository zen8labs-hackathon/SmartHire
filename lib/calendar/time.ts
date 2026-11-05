/**
 * Calendar time helpers. The company runs on GMT+7 (Asia/Ho_Chi_Minh, no
 * DST), so every calendar computation uses a fixed +420 minute offset
 * rather than the server's local zone. Calendar dates are ISO strings
 * (`YYYY-MM-DD`) and times of day are minutes since local midnight.
 */

export const TZ_OFFSET_MIN = 420;

const MS_PER_MIN = 60_000;
const MS_PER_DAY = 86_400_000;

function shifted(d: Date): Date {
  return new Date(d.getTime() + TZ_OFFSET_MIN * MS_PER_MIN);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function parseIso(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function formatUtc(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Calendar date of an instant in GMT+7. */
export function isoDateInTz(d: Date): string {
  return formatUtc(shifted(d).getTime());
}

/** Minutes since GMT+7 midnight of an instant. */
export function minuteOfDayInTz(d: Date): number {
  const s = shifted(d);
  return s.getUTCHours() * 60 + s.getUTCMinutes();
}

/** Instant for a GMT+7 calendar date plus minute-of-day. */
export function fromLocal(date: string, minute: number): Date {
  return new Date(parseIso(date) + (minute - TZ_OFFSET_MIN) * MS_PER_MIN);
}

/** ISO weekday of a calendar date: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: string): number {
  const w = new Date(parseIso(date)).getUTCDay();
  return w === 0 ? 7 : w;
}

export function addDays(date: string, n: number): string {
  return formatUtc(parseIso(date) + n * MS_PER_DAY);
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function diffDays(a: string, b: string): number {
  return Math.round((parseIso(b) - parseIso(a)) / MS_PER_DAY);
}

/** Monday of the week containing `date`. */
export function weekStart(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

export function todayInTz(now: Date = new Date()): string {
  return isoDateInTz(now);
}

/** `HH:MM` for a minute-of-day. */
export function fmtMin(minute: number): string {
  return `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;
}

export const DURATION_MIN = 5;
/** Matches the cap the schedule API enforces. */
export const DURATION_MAX = 480;

/**
 * Minute-of-day from typed text: `9`, `930`, `9:30`, `09.30`, `9h30`, `2pm`,
 * `2:15 pm`. Null when it is not a valid time.
 */
export function parseClock(text: string): number | null {
  const m = /^(\d{1,2})(?:\s*[:.h]\s*(\d{1,2})?|(\d{2}))?\s*(am|pm)?$/.exec(text.trim().toLowerCase());
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2] ?? m[3] ?? 0);
  if (minute > 59) return null;
  if (m[4]) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (m[4] === "pm" ? 12 : 0);
  } else if (hour > 23) return null;
  return hour * 60 + minute;
}

/**
 * Length in minutes from typed text: `45`, `45m`, `1h`, `1.5h`, `1h30`,
 * `1:30`. A bare number is minutes. Null when invalid or outside
 * `DURATION_MIN`..`DURATION_MAX`.
 */
export function parseDuration(text: string): number | null {
  const t = text.trim().toLowerCase();
  let min: number | null = null;
  let m: RegExpExecArray | null;
  if ((m = /^(\d+)\s*(?:m|min|mins|minutes?)?$/.exec(t))) min = Number(m[1]);
  else if ((m = /^(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|hours?)$/.exec(t))) min = Math.round(Number(m[1].replace(",", ".")) * 60);
  else if ((m = /^(\d+)\s*(?:h|hr|hrs|hours?|:)\s*(\d{1,2})\s*(?:m|min|mins|minutes?)?$/.exec(t))) {
    if (Number(m[2]) > 59) return null;
    min = Number(m[1]) * 60 + Number(m[2]);
  }
  return min != null && min >= DURATION_MIN && min <= DURATION_MAX ? min : null;
}

const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function weekdayName(date: string): string {
  return WEEKDAY_NAMES[isoWeekday(date) - 1];
}
