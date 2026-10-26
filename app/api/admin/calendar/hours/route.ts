import {
  requireHrForRequest,
  requireStaffForRequest,
} from "@/lib/admin/require-staff-request";
import { invalidJson, readJson } from "@/lib/calendar/validation";
import { getWorkingHours, setWorkingHours } from "@/lib/db/company-settings";
import { getPool } from "@/lib/db/config/client";
import { logApiError } from "@/lib/logger";
import { NextRequest } from "next/server";
import { z } from "zod";

/** 06:00–21:00 on a 30-minute grid (BR-08-03). */
const minute = z
  .number()
  .int()
  .min(360)
  .max(1260)
  .refine((m) => m % 30 === 0, "Times must be on a 30-minute step.");

const hoursSchema = z
  .object({
    start: minute,
    end: minute,
    days: z
      .array(z.number().int().min(1).max(7))
      .min(1, "Pick at least one working day.")
      .refine((d) => new Set(d).size === d.length, "Working days must be unique."),
  })
  .strict()
  .refine((h) => h.start < h.end, "Start must be before end.");

export async function GET(request: NextRequest) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;
  try {
    return Response.json({ hours: await getWorkingHours(getPool()) });
  } catch (e) {
    logApiError("Calendar hours: query failed", e, { userId: auth.userId });
    return Response.json({ error: "Could not load working hours." }, { status: 500 });
  }
}

/** HR only. */
export async function PUT(request: NextRequest) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const json = await readJson(request);
  if (json === undefined) return invalidJson();
  const parsed = hoursSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }

  try {
    const hours = await setWorkingHours(
      getPool(),
      { ...parsed.data, days: [...parsed.data.days].sort((a, b) => a - b) },
      auth.userId,
    );
    return Response.json({ hours });
  } catch (e) {
    logApiError("Calendar hours: update failed", e, { userId: auth.userId });
    return Response.json({ error: "Could not save working hours." }, { status: 500 });
  }
}
