/**
 * Cancels upcoming interviews when the thing they belong to goes away: the
 * candidate is rejected or withdraws, the application is deleted, or the
 * position is closed or put on hold.
 */

import {
  listScheduleInterviewers,
  updateCandidateSchedule,
  type CandidateScheduleRow,
} from "@/lib/db/candidate-schedules";
import type { QueryExecutor } from "@/lib/db/config/client";
import { calendarHref, notifyUsers } from "@/lib/calendar/notify";
import { NOTIFICATION_TYPE } from "@/lib/redis/channels";

export type CascadeOptions = {
  reason: string;
  actorId: string;
  /** Tell the interviewers and organizer. Defaults to true. */
  notify?: boolean;
};

/**
 * Marks each session Canceled and, unless told not to, notifies its
 * non-declined interviewers and organizer (never the actor). Never throws:
 * a failure on one session is logged and the rest still run, so the caller's
 * own change is not undone by a cascade problem. Returns how many were canceled.
 */
export async function cancelUpcomingSessions(
  db: QueryExecutor,
  schedules: CandidateScheduleRow[],
  { reason, actorId, notify = true }: CascadeOptions,
): Promise<number> {
  let canceled = 0;
  for (const row of schedules) {
    const scheduleId = String(row.id);
    try {
      await updateCandidateSchedule(db, scheduleId, {
        status: "Canceled",
        cancelReason: reason,
        canceledBy: actorId,
        canceledAt: new Date(),
      });
      canceled++;
      if (!notify) continue;
      const seats = await listScheduleInterviewers(db, scheduleId);
      const recipients = [
        ...seats.filter((s) => !s.declined_at).map((s) => s.profile_id),
        row.created_by,
      ].filter((id) => id !== actorId);
      await notifyUsers(db, recipients, {
        type: NOTIFICATION_TYPE.InterviewCanceled,
        title: `${row.round_label ?? "Interview"} was canceled`,
        body: reason,
        data: {
          scheduleId,
          campaignAppliedId: row.campaign_applied_id,
          href: calendarHref(scheduleId, row.scheduled_at),
        },
      });
    } catch (err) {
      console.error("[calendar/cascade] failed to cancel", scheduleId, err);
    }
  }
  return canceled;
}
