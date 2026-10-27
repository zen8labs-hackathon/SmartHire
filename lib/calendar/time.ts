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

const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function weekdayName(date: string): string {
  return WEEKDAY_NAMES[isoWeekday(date) - 1];
}
