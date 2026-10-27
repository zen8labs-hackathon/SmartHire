/**
 * Shared pieces of the busy-block API: request schema, JSON shapes, the
 * sessions a block overlaps and the BUSY_CONFLICT notice to organizers.
 */

import { busyBlockFromRow, expandBusyBlock } from "@/lib/calendar/expand";
import { calendarHref, fmtWhen, notifyUsers, sendEmail } from "@/lib/calendar/notify";
import { fromLocal, todayInTz } from "@/lib/calendar/time";
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
  days: z.array(z.number().int().min(1).max(7)).max(7).default([]),
  note: z
    .string()
    .trim()
    .max(BUSY_NOTE_MAX, `Note must be at most ${BUSY_NOTE_MAX} characters.`)
    .nullable()
    .default(null),
  onOverlap: z.enum(["keep", "ask"]).default("keep"),
});

export type BusyShapeBody = z.infer<typeof busyShapeSchema>;

/**
 * How the "future" rule applies (BR-03-07): `first` — the first day must
 * start at or after now (new blocks, edits of one day or "this and
 * following"); `any` — at least one day must (edits of a whole series that
 * has already started).
 */
export type BusyFutureRule = "first" | "any";

/**
 * Normalizes all-day minutes and returns a validation error, if any. Checks
 * run in the D-03-2 order: time range, then at least one day (BR-03-06),
 * then a future start (BR-03-07).
 */
export function normalizeBusyShape(
  b: BusyShapeBody,
  opts: { now?: Date; future?: BusyFutureRule } = {},
): { shape: BusyShapeBody; error: string | null } {
  const base = b.allDay ? { ...b, fromMin: null, toMin: null } : b;
  const days = [...new Set(base.days)].sort((a, c) => a - c);
  const shape = { ...base, days, note: base.note || null };
  return { shape, error: busyShapeError(shape) ?? busyDaysError(shape, opts) };
}

function busyDaysError(
  shape: BusyShapeBody,
  { now = new Date(), future = "first" }: { now?: Date; future?: BusyFutureRule },
): string | null {
  const last = shape.repeat === "none" ? shape.startDate : (shape.untilDate ?? shape.startDate);
  const days = expandBusyBlock(
    { ...shape, id: "", ownerId: "", note: null, removedDates: [] },
    shape.startDate,
    last,
  );
  if (days.length === 0) return "This repeat has no days before the end date.";
  const today = todayInTz(now);
  const upcoming = (date: string) =>
    shape.allDay ? date >= today : fromLocal(date, shape.fromMin ?? 0).getTime() >= now.getTime();
  const ok = future === "first" ? upcoming(days[0].date) : days.some((d) => upcoming(d.date));
  return ok ? null : "Choose a future time.";
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
    days: row.days ?? [],
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
  const targets = overlaps.filter((s) => s.row.created_by && s.row.created_by !== ownerId);
  if (targets.length === 0) return;
  const organizers = await getUsersByIds(db, [...new Set(targets.map((s) => s.row.created_by!))]);
  const emailOf = new Map(organizers.map((u) => [u.id, u.email]));
  for (const s of targets) {
    const round = s.row.round_label ?? "Interview";
    const candidate = s.row.candidate_name ?? "a candidate";
    const title = `${ownerName} is now busy during an interview`;
    const body = `${round} with ${candidate} may need a new time or interviewer.`;
    const href = calendarHref(String(s.row.id), s.row.scheduled_at);
    await notifyUsers(db, [s.row.created_by], {
      type: NOTIFICATION_TYPE.BusyConflict,
      title,
      body,
      data: { scheduleId: String(s.row.id), ownerId, href },
    });
    // BR-03-11: organizers are told in-app and by email.
    await sendEmail({
      to: [emailOf.get(s.row.created_by!)],
      subject: title,
      text: `${body}\n\nWhen: ${fmtWhen(s.row.scheduled_at)}\nOpen in SmartHire: ${appUrl(href)}`,
    });
  }
}

/** Absolute link for emails; relative when APP_URL is not set. */
export function appUrl(href: string): string {
  const base = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  return `${base.replace(/\/$/, "")}${href}`;
}

/** The owner's display name, for notification copy. */
export async function ownerDisplayName(db: QueryExecutor, ownerId: string): Promise<string> {
  const [u] = await getUsersByIds(db, [ownerId]);
  return u ? displayName(u) : "An interviewer";
}
