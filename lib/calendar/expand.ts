/**
 * Busy-block recurrence expansion. A block repeats `none`, on `weekdays`
 * (ISO 1-5) or `weekly` (on `days`, or the ISO weekday of `startDate` when
 * `days` is empty) until `untilDate`; dates listed in `removedDates` are skipped.
 */

import type { BusyBlockRepeat, BusyBlockRow } from "@/lib/db/busy-blocks";
import { dbDateToIso } from "@/lib/db/query-helpers";
import { addDays, diffDays, isoWeekday } from "@/lib/calendar/time";

export type BusyBlockInput = {
  id: string;
  ownerId: string;
  startDate: string;
  allDay: boolean;
  fromMin: number | null;
  toMin: number | null;
  repeat: BusyBlockRepeat;
  untilDate: string | null;
  /** ISO weekdays of a weekly repeat; empty falls back to the weekday of `startDate`. */
  days: number[];
  note: string | null;
  removedDates: string[];
};

export type BusyOccurrence = {
  blockId: string;
  ownerId: string;
  date: string;
  allDay: boolean;
  fromMin: number | null;
  toMin: number | null;
  note: string | null;
};

export function busyBlockFromRow(row: BusyBlockRow): BusyBlockInput {
  return {
    id: row.id,
    ownerId: row.owner_id,
    startDate: dbDateToIso(row.start_date)!,
    allDay: row.all_day,
    fromMin: row.from_min,
    toMin: row.to_min,
    repeat: row.repeat,
    untilDate: dbDateToIso(row.until_date),
    days: row.days ?? [],
    note: row.note,
    removedDates: (row.removed_dates ?? [])
      .map((d) => dbDateToIso(d))
      .filter((d): d is string => d !== null),
  };
}

function matchesRepeat(block: BusyBlockInput, date: string): boolean {
  if (block.repeat === "weekdays") return isoWeekday(date) <= 5;
  if (block.repeat === "weekly") {
    return block.days.length > 0
      ? block.days.includes(isoWeekday(date))
      : isoWeekday(date) === isoWeekday(block.startDate);
  }
  return date === block.startDate;
}

/** Occurrences of one block within `[from, to]` (inclusive ISO dates). */
export function expandBusyBlock(
  block: BusyBlockInput,
  from: string,
  to: string,
): BusyOccurrence[] {
  const last = block.repeat === "none" ? block.startDate : (block.untilDate ?? block.startDate);
  const start = diffDays(block.startDate, from) > 0 ? from : block.startDate;
  const end = diffDays(last, to) < 0 ? to : last;
  if (diffDays(start, end) < 0) return [];

  const removed = new Set(block.removedDates);
  const out: BusyOccurrence[] = [];
  for (let d = start; diffDays(d, end) >= 0; d = addDays(d, 1)) {
    if (removed.has(d) || !matchesRepeat(block, d)) continue;
    out.push({
      blockId: block.id,
      ownerId: block.ownerId,
      date: d,
      allDay: block.allDay,
      fromMin: block.allDay ? null : block.fromMin,
      toMin: block.allDay ? null : block.toMin,
      note: block.note,
    });
  }
  return out;
}

/** Occurrences of many blocks, sorted by date then start minute. */
export function expandBusyBlocks(
  blocks: BusyBlockInput[],
  from: string,
  to: string,
): BusyOccurrence[] {
  return blocks
    .flatMap((b) => expandBusyBlock(b, from, to))
    .sort(
      (a, b) =>
        diffDays(b.date, a.date) || (a.fromMin ?? -1) - (b.fromMin ?? -1),
    );
}
