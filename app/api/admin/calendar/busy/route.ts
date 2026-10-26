import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import {
  busyBlockJson,
  busyShapeSchema,
  normalizeBusyShape,
  notifyBusyConflict,
  overlapJson,
  overlapsForBlocks,
  ownerDisplayName,
} from "@/lib/calendar/busy";
import { invalidJson, readJson } from "@/lib/calendar/validation";
import { createBusyBlock } from "@/lib/db/busy-blocks";
import { getPool } from "@/lib/db/config/client";
import { logApiError } from "@/lib/logger";
import { NextRequest } from "next/server";

/**
 * Creates a busy block for the caller. Returns the upcoming sessions it
 * overlaps; with `onOverlap: "ask"` their organizers are notified.
 */
export async function POST(request: NextRequest) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const json = await readJson(request);
  if (json === undefined) return invalidJson();
  const parsed = busyShapeSchema.strict().safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }
  const { shape, error } = normalizeBusyShape(parsed.data);
  if (error) return Response.json({ error }, { status: 400 });

  const db = getPool();
  try {
    const row = await createBusyBlock(db, {
      ownerId: auth.userId,
      startDate: shape.startDate,
      allDay: shape.allDay,
      fromMin: shape.fromMin,
      toMin: shape.toMin,
      repeat: shape.repeat,
      untilDate: shape.untilDate,
      days: shape.days,
      note: shape.note,
    });
    const overlaps = await overlapsForBlocks(db, auth.userId, [row]);
    if (shape.onOverlap === "ask" && overlaps.length > 0) {
      await notifyBusyConflict(db, auth.userId, await ownerDisplayName(db, auth.userId), overlaps);
    }
    return Response.json(
      { block: busyBlockJson(row), overlaps: overlaps.map(overlapJson) },
      { status: 201 },
    );
  } catch (e) {
    logApiError("Calendar busy: create failed", e, { userId: auth.userId });
    return Response.json({ error: "Could not save busy time." }, { status: 500 });
  }
}
