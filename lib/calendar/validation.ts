/** Request-parsing helpers shared by the Calendar API routes. */

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const SCHEDULE_ID_RE = /^\d+$/;

/** True for a real calendar date in `YYYY-MM-DD` form. */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Parses a JSON body; returns `undefined` when the body is not valid JSON. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export function invalidJson(): Response {
  return Response.json({ error: "Invalid JSON body." }, { status: 400 });
}

export function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

/** Busy blocks sit inside 08:00-19:00 on a 30-minute grid. */
export const BUSY_MIN_MINUTE = 480;
export const BUSY_MAX_MINUTE = 1140;
export const BUSY_STEP_MINUTES = 30;
/** A recurring block may run at most this many days past its start. */
export const BUSY_MAX_REPEAT_DAYS = 92;
export const BUSY_NOTE_MAX = 200;

export type BusyShape = {
  startDate: string;
  allDay: boolean;
  fromMin: number | null;
  toMin: number | null;
  repeat: "none" | "weekdays" | "weekly";
  untilDate: string | null;
};

function onGrid(m: number): boolean {
  return (
    Number.isInteger(m) &&
    m >= BUSY_MIN_MINUTE &&
    m <= BUSY_MAX_MINUTE &&
    m % BUSY_STEP_MINUTES === 0
  );
}

/** Returns an error message for an invalid busy block, or `null`. */
export function busyShapeError(b: BusyShape): string | null {
  if (!isIsoDate(b.startDate)) return "startDate must be a YYYY-MM-DD date.";
  if (!b.allDay) {
    if (b.fromMin === null || b.toMin === null) {
      return "Pick a start and end time, or mark the block all day.";
    }
    if (!onGrid(b.fromMin) || !onGrid(b.toMin)) {
      return "Times must be on the half hour between 08:00 and 19:00.";
    }
    if (b.fromMin >= b.toMin) return "Start must be before end.";
  }
  if (b.repeat === "none") {
    if (b.untilDate !== null) return "Only a repeating block can have an end date.";
    return null;
  }
  if (b.untilDate === null) return "A repeating block needs an end date.";
  if (!isIsoDate(b.untilDate)) return "untilDate must be a YYYY-MM-DD date.";
  const span =
    (Date.parse(`${b.untilDate}T00:00:00Z`) - Date.parse(`${b.startDate}T00:00:00Z`)) /
    86_400_000;
  if (span < 0) return "The end date must be on or after the start date.";
  if (span > BUSY_MAX_REPEAT_DAYS) return "A repeating block can run at most 3 months.";
  return null;
}
