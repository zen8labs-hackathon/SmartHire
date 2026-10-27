import { requireUserForRequest } from "@/lib/admin/require-staff-request";
import { busyShapeSchema, normalizeBusyShape, overlapJson } from "@/lib/calendar/busy";
import { expandBusyBlock } from "@/lib/calendar/expand";
import { busyOverlaps } from "@/lib/calendar/server";
import { invalidJson, readJson } from "@/lib/calendar/validation";
import { getPool } from "@/lib/db/config/client";
import { logApiError } from "@/lib/logger";
import { NextRequest } from "next/server";

/**
 * Previews the upcoming interviews a busy shape would overlap over its whole
 * repeat range (BR-03-09), without saving anything.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUserForRequest(request);
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
  // An edit may keep a started series, so only the shape itself is checked.
  const { shape, error } = normalizeBusyShape(parsed.data, { future: "any" });
  if (error) return Response.json({ error }, { status: 400 });

  try {
    const occurrences = expandBusyBlock(
      { ...shape, id: "", ownerId: auth.userId, note: null, removedDates: [] },
      shape.startDate,
      shape.repeat === "none" ? shape.startDate : (shape.untilDate ?? shape.startDate),
    );
    const overlaps = await busyOverlaps(getPool(), auth.userId, occurrences);
    return Response.json({ overlaps: overlaps.map(overlapJson) });
  } catch (e) {
    logApiError("Calendar busy: preview failed", e, { userId: auth.userId });
    return Response.json({ error: "Could not check overlaps." }, { status: 500 });
  }
}
