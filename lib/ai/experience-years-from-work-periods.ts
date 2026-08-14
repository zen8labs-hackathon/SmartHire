/**
 * Derives professional experience from dated work-history intervals:
 * merge overlaps, skip gaps, do not count from first job until today.
 *
 * Dates: `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`. `end: null` means still employed
 * (interval runs through `now`).
 */

export type WorkPeriod = {
  start: string;
  end: string | null;
};

type MsInterval = { startMs: number; endMs: number };

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

export function experienceYearsFromWorkPeriods(
  periods: WorkPeriod[] | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!periods?.length) return null;

  const nowMs = now.getTime();
  const intervals: MsInterval[] = [];
  for (const period of periods) {
    const parsed = toMsInterval(period, nowMs);
    if (parsed) intervals.push(parsed);
  }
  if (intervals.length === 0) return null;

  const merged = mergeIntervals(intervals);
  let totalMs = 0;
  for (const interval of merged) {
    totalMs += interval.endMs - interval.startMs;
  }
  const years = totalMs / MS_PER_YEAR;
  if (!Number.isFinite(years) || years < 0) return null;
  if (years === 0) return 0;

  return Math.round(years * 10) / 10;
}

function toMsInterval(period: WorkPeriod, nowMs: number): MsInterval | null {
  const start = parsePeriodStart(period.start);
  if (!start) return null;

  const endMs =
    period.end == null || period.end.trim() === ""
      ? nowMs
      : parsePeriodEndExclusive(period.end);
  if (endMs == null) return null;
  if (start.getTime() >= endMs) return null;
  if (start.getTime() > nowMs) return null;

  return { startMs: start.getTime(), endMs: Math.min(endMs, nowMs) };
}

function mergeIntervals(intervals: MsInterval[]): MsInterval[] {
  const sorted = [...intervals].sort((a, b) => a.startMs - b.startMs);
  const merged: MsInterval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (!last || interval.startMs > last.endMs) {
      merged.push({ ...interval });
    } else {
      last.endMs = Math.max(last.endMs, interval.endMs);
    }
  }
  return merged;
}

function parsePeriodStart(value: string): Date | null {
  return parseWorkDate(value.trim(), "start");
}

/** Exclusive end instant so Jan–Jun is six months, not six months + a day. */
function parsePeriodEndExclusive(value: string): number | null {
  const d = parseWorkDate(value.trim(), "end");
  return d ? d.getTime() : null;
}

function parseWorkDate(value: string, bound: "start" | "end"): Date | null {
  const yearOnly = /^(\d{4})$/.exec(value);
  if (yearOnly) {
    const y = Number(yearOnly[1]);
    if (y < 1950 || y > 2100) return null;
    return bound === "start" ? new Date(y, 0, 1) : new Date(y + 1, 0, 1);
  }

  const yearMonth = /^(\d{4})-(\d{2})$/.exec(value);
  if (yearMonth) {
    const y = Number(yearMonth[1]);
    const m = Number(yearMonth[2]);
    if (y < 1950 || y > 2100 || m < 1 || m > 12) return null;
    return bound === "start" ? new Date(y, m - 1, 1) : new Date(y, m, 1);
  }

  const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (full) {
    const y = Number(full[1]);
    const m = Number(full[2]);
    const d = Number(full[3]);
    if (y < 1950 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) {
      return null;
    }
    const dt = new Date(y, m - 1, d);
    if (
      dt.getFullYear() !== y ||
      dt.getMonth() !== m - 1 ||
      dt.getDate() !== d
    ) {
      return null;
    }
    return bound === "start"
      ? dt
      : new Date(y, m - 1, d + 1);
  }

  return null;
}
