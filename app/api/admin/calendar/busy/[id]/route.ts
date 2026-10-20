import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import {
  busyBlockJson,
  busyShapeSchema,
  normalizeBusyShape,
  notifyBusyConflict,
  overlapJson,
  overlapsForBlocks,
  ownerDisplayName,
  type BusyShapeBody,
} from "@/lib/calendar/busy";
import { BUSY_NOTE_MAX, UUID_RE, badRequest, invalidJson, isIsoDate, readJson } from "@/lib/calendar/validation";
import {
  addBusyBlockRemovedDate,
  createBusyBlock,
  getBusyBlockById,
  softDeleteBusyBlock,
  truncateBusyBlockSeries,
  updateBusyBlock,
  type BusyBlockRow,
} from "@/lib/db/busy-blocks";
import { getPool, withTransaction, type QueryExecutor } from "@/lib/db/config/client";
import { dbDateToIso } from "@/lib/db/query-helpers";
import { logApiError } from "@/lib/logger";
import { NextRequest } from "next/server";
import { z } from "zod";

type RouteContext = { params: Promise<{ id: string }> };
type Scope = "day" | "series" | "following";

const scopeSchema = z.enum(["day", "series", "following"]).default("series");

// No defaults here: an omitted field keeps the block's current value.
const shape = busyShapeSchema.shape;
const patchSchema = z
  .object({
    startDate: shape.startDate.optional(),
    allDay: z.boolean().optional(),
    fromMin: z.number().int().nullable().optional(),
    toMin: z.number().int().nullable().optional(),
    repeat: z.enum(["none", "weekdays", "weekly"]).optional(),
    untilDate: z.string().nullable().optional(),
    note: z
      .string()
      .trim()
      .max(BUSY_NOTE_MAX, `Note must be at most ${BUSY_NOTE_MAX} characters.`)
      .nullable()
      .optional(),
    scope: scopeSchema,
    date: z.string().nullable().optional(),
    onOverlap: z.enum(["keep", "ask"]).default("keep"),
  })
  .strict();

const notFound = () => Response.json({ error: "Busy block not found." }, { status: 404 });

/** Loads the caller's own block; anyone else's reads as missing. */
async function loadOwned(db: QueryExecutor, id: string, ownerId: string) {
  if (!UUID_RE.test(id)) return null;
  const row = await getBusyBlockById(db, id);
  return row && row.owner_id === ownerId ? row : null;
}

/** Whether `date` is an occurrence date of the series (ignoring removals). */
function inSeries(row: BusyBlockRow, date: string): boolean {
  const start = dbDateToIso(row.start_date) ?? "";
  const until = dbDateToIso(row.until_date) ?? start;
  return date >= start && date <= until;
}

/** `day`/`following` only make sense inside a repeating series. */
function resolveScope(
  row: BusyBlockRow,
  scope: Scope,
  date: string | null | undefined,
): { scope: Scope; date: string | null } | { error: string } {
  if (scope === "series" || row.repeat === "none") return { scope: "series", date: null };
  if (!date || !isIsoDate(date)) return { error: "date must be a YYYY-MM-DD date." };
  if (!inSeries(row, date)) return { error: "date is not part of this series." };
  if (scope === "following" && date === dbDateToIso(row.start_date)) {
    return { scope: "series", date: null };
  }
  return { scope, date };
}

function currentShape(row: BusyBlockRow): BusyShapeBody {
  return {
    startDate: dbDateToIso(row.start_date) ?? "",
    allDay: row.all_day,
    fromMin: row.from_min,
    toMin: row.to_min,
    repeat: row.repeat,
    untilDate: dbDateToIso(row.until_date),
    note: row.note,
    onOverlap: "keep",
  };
}

/**
 * Edits the caller's busy block. `scope` picks what changes in a series:
 * `day` (only `date`), `following` (`date` onward) or `series` (all).
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;

  const json = await readJson(request);
  if (json === undefined) return invalidJson();
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }
  const { scope: rawScope, date: rawDate, onOverlap, ...patch } = parsed.data;
  const me = auth.userId;
  const db = getPool();

  try {
    const row = await loadOwned(db, id, me);
    if (!row) return notFound();
    const resolved = resolveScope(row, rawScope, rawDate);
    if ("error" in resolved) return badRequest(resolved.error);
    const { scope, date } = resolved;

    const defined = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    ) as Partial<BusyShapeBody>;
    const base = currentShape(row);
    let merged: BusyShapeBody;
    if (scope === "day") {
      // A single detached occurrence on `date`.
      merged = { ...base, ...defined, startDate: date!, repeat: "none", untilDate: null };
    } else if (scope === "following") {
      merged = { ...base, untilDate: base.untilDate, ...defined, startDate: defined.startDate ?? date! };
    } else {
      merged = { ...base, ...defined };
    }
    if (merged.repeat === "none") merged.untilDate = null;
    const { shape, error } = normalizeBusyShape(merged);
    if (error) return badRequest(error);

    const fields = {
      startDate: shape.startDate,
      allDay: shape.allDay,
      fromMin: shape.fromMin,
      toMin: shape.toMin,
      repeat: shape.repeat,
      untilDate: shape.untilDate,
      note: shape.note,
    };

    const changed = await withTransaction(async (tx) => {
      if (scope === "series") {
        const updated = await updateBusyBlock(tx, row.id, fields);
        return updated ? [updated] : [];
      }
      const kept =
        scope === "day"
          ? await addBusyBlockRemovedDate(tx, row.id, date!)
          : await truncateBusyBlockSeries(tx, row.id, date!);
      if (!kept) return [];
      const created = await createBusyBlock(tx, {
        ownerId: me,
        ...fields,
        seriesParentId: row.series_parent_id ?? row.id,
      });
      return [kept, created];
    });
    if (changed.length === 0) return notFound();

    // Only the edited part can introduce new overlaps.
    const edited = changed[changed.length - 1];
    const overlaps = await overlapsForBlocks(db, me, [edited]);
    if (onOverlap === "ask" && overlaps.length > 0) {
      await notifyBusyConflict(db, me, await ownerDisplayName(db, me), overlaps);
    }
    return Response.json({
      blocks: changed.map(busyBlockJson),
      overlaps: overlaps.map(overlapJson),
    });
  } catch (e) {
    logApiError("Calendar busy: update failed", e, { userId: me, blockId: id });
    return Response.json({ error: "Could not update busy time." }, { status: 500 });
  }
}

/** Deletes the caller's busy block: `?scope=day|following|series&date=YYYY-MM-DD`. */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;

  const { searchParams } = new URL(request.url);
  const scopeParsed = scopeSchema.safeParse(searchParams.get("scope") ?? undefined);
  if (!scopeParsed.success) return badRequest("scope must be day, following or series.");
  const me = auth.userId;
  const db = getPool();

  try {
    const row = await loadOwned(db, id, me);
    if (!row) return notFound();
    const resolved = resolveScope(row, scopeParsed.data, searchParams.get("date"));
    if ("error" in resolved) return badRequest(resolved.error);
    const { scope, date } = resolved;

    if (scope === "series") {
      const ok = await softDeleteBusyBlock(db, row.id);
      return ok ? Response.json({ ok: true, block: null }) : notFound();
    }
    const kept =
      scope === "day"
        ? await addBusyBlockRemovedDate(db, row.id, date!)
        : await truncateBusyBlockSeries(db, row.id, date!);
    if (!kept) return notFound();
    return Response.json({ ok: true, block: busyBlockJson(kept) });
  } catch (e) {
    logApiError("Calendar busy: delete failed", e, { userId: me, blockId: id });
    return Response.json({ error: "Could not delete busy time." }, { status: 500 });
  }
}

