import { ownerDisplayName } from "@/lib/calendar/busy";
import { calendarHref, notifyUsers } from "@/lib/calendar/notify";
import {
  listOverdueEvaluationSeats,
  markOverdueNotified,
  OVERDUE_REMINDER_CUTOFF,
} from "@/lib/db/candidate-schedules";
import { getPool } from "@/lib/db/config/client";
import { logApiError } from "@/lib/logger";
import { NOTIFICATION_TYPE } from "@/lib/redis/channels";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Internal endpoint: a scheduler calls this to remind interviewers whose
 * evaluation is past due, and their organizers. Each seat is claimed before
 * notifying, so repeated or overlapping runs notify at most once per seat.
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-internal-secret");
  if (!secret || secret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = getPool();
  try {
    const seats = await listOverdueEvaluationSeats(db, OVERDUE_REMINDER_CUTOFF);
    let notified = 0;
    for (const s of seats) {
      const claimed = await markOverdueNotified(db, s.schedule_id, s.profile_id);
      if (!claimed) continue;
      const round = s.round_label ?? "Interview";
      const data = {
        scheduleId: s.schedule_id,
        campaignAppliedId: s.campaign_applied_id,
        href: calendarHref(String(s.schedule_id), s.scheduled_at),
      };
      await notifyUsers(db, [s.profile_id], {
        type: NOTIFICATION_TYPE.EvaluationOverdue,
        title: `Evaluation overdue: ${round}`,
        body: s.candidate_name
          ? `Your evaluation of ${s.candidate_name} is past due.`
          : "Your evaluation is past due.",
        data,
      });
      // BR-05-07: the organizer hears about it too (reminder only, no block).
      if (s.created_by && s.created_by !== s.profile_id) {
        const name = await ownerDisplayName(db, s.profile_id);
        await notifyUsers(db, [s.created_by], {
          type: NOTIFICATION_TYPE.EvaluationOverdue,
          title: `${name}'s evaluation is overdue: ${round}`,
          body: s.candidate_name ? `Evaluation of ${s.candidate_name} is past due.` : undefined,
          data: { ...data, interviewerId: s.profile_id },
        });
      }
      notified += 1;
    }
    return NextResponse.json({ notified });
  } catch (e) {
    logApiError("Calendar overdue: run failed", e);
    return NextResponse.json({ error: "Could not process overdue evaluations." }, { status: 500 });
  }
}
