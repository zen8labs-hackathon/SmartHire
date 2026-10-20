import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { ownerDisplayName } from "@/lib/calendar/busy";
import { notifyUsers } from "@/lib/calendar/notify";
import { SCHEDULE_ID_RE, invalidJson, readJson } from "@/lib/calendar/validation";
import {
  declineScheduleInterviewer,
  getCandidateScheduleById,
  listScheduleInterviewers,
  setNoInterviewerFlag,
  withdrawScheduleInterviewerDecline,
  type CandidateScheduleRow,
} from "@/lib/db/candidate-schedules";
import { getPool, withTransaction, type QueryExecutor } from "@/lib/db/config/client";
import { logApiError } from "@/lib/logger";
import { NOTIFICATION_TYPE } from "@/lib/redis/channels";
import { NextRequest } from "next/server";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

const URGENT_MS = 2 * 60 * 60_000;
const UPCOMING = new Set(["Scheduled", "Confirmed"]);

const declineSchema = z
  .object({ reason: z.string().trim().max(500, "Keep the reason under 500 characters.").optional() })
  .strict();

function notFound() {
  return Response.json({ error: "Session not found." }, { status: 404 });
}

/** The session, if the caller holds a seat on it and it has not started. */
async function loadSeat(
  db: QueryExecutor,
  id: string,
  userId: string,
): Promise<{ row: CandidateScheduleRow } | Response> {
  if (!SCHEDULE_ID_RE.test(id)) return notFound();
  const row = await getCandidateScheduleById(db, id);
  if (!row) return notFound();
  const seats = await listScheduleInterviewers(db, id);
  if (!seats.some((s) => s.profile_id === userId)) return notFound();
  if (!UPCOMING.has(row.status) || new Date(row.scheduled_at).getTime() <= Date.now()) {
    return Response.json(
      { error: "You can only change your response before the interview starts." },
      { status: 400 },
    );
  }
  return { row };
}

/** Declines the caller's interviewer seat. */
export async function POST(request: NextRequest, { params }: Ctx) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const json = await readJson(request);
  if (json === undefined) return invalidJson();
  const parsed = declineSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }
  const reason = parsed.data.reason || null;

  const db = getPool();
  try {
    const loaded = await loadSeat(db, id, auth.userId);
    if (loaded instanceof Response) return loaded;
    const { row } = loaded;

    const { seat, allDeclined } = await withTransaction(async (tx) => {
      const seat = await declineScheduleInterviewer(tx, id, auth.userId, reason);
      const seats = await listScheduleInterviewers(tx, id);
      const allDeclined = seats.length > 0 && seats.every((s) => s.declined_at !== null);
      if (allDeclined) await setNoInterviewerFlag(tx, id, true);
      return { seat, allDeclined };
    });

    const round = row.round_label ?? "Interview";
    const name = await ownerDisplayName(db, auth.userId);
    const data = { scheduleId: id, campaignAppliedId: row.campaign_applied_id };
    await notifyUsers(db, [row.created_by], {
      type: NOTIFICATION_TYPE.InterviewDeclined,
      title: `${name} declined ${round}`,
      body: reason ?? undefined,
      data: { ...data, interviewerId: auth.userId },
    });
    if (allDeclined) {
      const urgent = new Date(row.scheduled_at).getTime() - Date.now() < URGENT_MS;
      await notifyUsers(db, [row.created_by], {
        type: NOTIFICATION_TYPE.InterviewNoInterviewer,
        title: `${round} has no interviewer`,
        body: "Every assigned interviewer has declined. Assign someone or reschedule.",
        data: { ...data, urgent },
      });
    }

    return Response.json({
      seat: seat && {
        id: seat.profile_id,
        declinedAt: seat.declined_at,
        declineReason: seat.decline_reason,
      },
      noInterviewer: allDeclined,
    });
  } catch (e) {
    logApiError("Calendar decline: failed", e, { userId: auth.userId });
    return Response.json({ error: "Could not decline the interview." }, { status: 500 });
  }
}

/** Withdraws the caller's decline. */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const db = getPool();
  try {
    const loaded = await loadSeat(db, id, auth.userId);
    if (loaded instanceof Response) return loaded;

    const seat = await withTransaction(async (tx) => {
      const seat = await withdrawScheduleInterviewerDecline(tx, id, auth.userId);
      await setNoInterviewerFlag(tx, id, false);
      return seat;
    });
    return Response.json({
      seat: seat && { id: seat.profile_id, declinedAt: null, declineReason: null },
      noInterviewer: false,
    });
  } catch (e) {
    logApiError("Calendar decline: withdraw failed", e, { userId: auth.userId });
    return Response.json({ error: "Could not withdraw the decline." }, { status: 500 });
  }
}
