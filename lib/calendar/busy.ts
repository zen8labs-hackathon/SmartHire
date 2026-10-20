/**
 * Shared pieces of the busy-block API: request schema, JSON shapes, the
 * sessions a block overlaps and the BUSY_CONFLICT notice to organizers.
 */

import { busyBlockFromRow, expandBusyBlock } from "@/lib/calendar/expand";
import { notifyUsers } from "@/lib/calendar/notify";
import { busyOverlaps, displayName, sessionDuration, type LoadedSession } from "@/lib/calendar/server";
import { BUSY_NOTE_MAX, busyShapeError } from "@/lib/calendar/validation";
import type { BusyBlockRow } from "@/lib/db/busy-blocks";
import type { QueryExecutor } from "@/lib/db/config/client";
import { dbDateToIso } from "@/lib/db/query-helpers";
import { getUsersByIds } from "@/lib/db/users";
import { NOTIFICATION_TYPE } from "@/lib/redis/channels";
import { z } from "zod";

export const busyShapeSchema = z.object({
  startDate: z.string(),
  allDay: z.boolean().default(false),
  fromMin: z.number().int().nullable().default(null),
  toMin: z.number().int().nullable().default(null),
  repeat: z.enum(["none", "weekdays", "weekly"]).default("none"),
  untilDate: z.string().nullable().default(null),
  note: z
    .string()
    .trim()
    .max(BUSY_NOTE_MAX, `Note must be at most ${BUSY_NOTE_MAX} characters.`)
    .nullable()
    .default(null),
  onOverlap: z.enum(["keep", "ask"]).default("keep"),
});

export type BusyShapeBody = z.infer<typeof busyShapeSchema>;

/** Normalizes all-day minutes and returns a validation error, if any. */
export function normalizeBusyShape(b: BusyShapeBody): { shape: BusyShapeBody; error: string | null } {
  const shape = b.allDay ? { ...b, fromMin: null, toMin: null } : b;
  return { shape: { ...shape, note: shape.note || null }, error: busyShapeError(shape) };
}

export function busyBlockJson(row: BusyBlockRow) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    startDate: dbDateToIso(row.start_date),
    allDay: row.all_day,
    fromMin: row.from_min,
    toMin: row.to_min,
    repeat: row.repeat,
    untilDate: dbDateToIso(row.until_date),
    note: row.note,
    removedDates: (row.removed_dates ?? []).map((d) => dbDateToIso(d)),
    seriesParentId: row.series_parent_id,
  };
}

export function overlapJson(s: LoadedSession) {
  const start = new Date(s.row.scheduled_at);
  return {
    id: String(s.row.id),
    start: start.toISOString(),
    end: new Date(start.getTime() + sessionDuration(s.row) * 60_000).toISOString(),
    round: s.row.round_label,
    candidateName: s.row.candidate_name,
    organizerId: s.row.created_by,
  };
}

/** Upcoming sessions overlapping any occurrence of these blocks. */
export async function overlapsForBlocks(
  db: QueryExecutor,
  ownerId: string,
  rows: BusyBlockRow[],
): Promise<LoadedSession[]> {
  const occurrences = rows.flatMap((row) => {
    const block = busyBlockFromRow(row);
    return expandBusyBlock(block, block.startDate, block.untilDate ?? block.startDate);
  });
  return busyOverlaps(db, ownerId, occurrences);
}

/** Tells each overlapping session's organizer (other than the owner) about the clash. */
export async function notifyBusyConflict(
  db: QueryExecutor,
  ownerId: string,
  ownerName: string,
  overlaps: LoadedSession[],
): Promise<void> {
  for (const s of overlaps) {
    if (!s.row.created_by || s.row.created_by === ownerId) continue;
    await notifyUsers(db, [s.row.created_by], {
      type: NOTIFICATION_TYPE.BusyConflict,
      title: `${ownerName} is now busy during an interview`,
      body: `${s.row.round_label ?? "Interview"} with ${s.row.candidate_name ?? "a candidate"} may need a new time or interviewer.`,
      data: { scheduleId: String(s.row.id), ownerId },
    });
  }
}

/** The owner's display name, for notification copy. */
export async function ownerDisplayName(db: QueryExecutor, ownerId: string): Promise<string> {
  const [u] = await getUsersByIds(db, [ownerId]);
  return u ? displayName(u) : "An interviewer";
}
