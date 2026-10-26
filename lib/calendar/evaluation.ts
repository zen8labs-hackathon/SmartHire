import type { QueryExecutor } from "@/lib/db/config/client";
import {
  countPendingEvaluationSeats,
  findOpenEvaluationSeatForApplication,
  markEvaluationSubmitted,
  updateCandidateSchedule,
} from "@/lib/db/candidate-schedules";

export type EvaluationSubmissionResult = {
  scheduleId: string | null;
  completed: boolean;
};

/**
 * BR-INT-07: an interviewer's evaluation closes their seat on the most recent
 * started session of the application; once every non-declined seat has
 * submitted, the session becomes `Completed`. The candidate's stage is not
 * touched (BR-INT-11). No seat (e.g. HR writing a note) is a no-op.
 */
export async function recordEvaluationSubmission(
  db: QueryExecutor,
  campaignAppliedId: string,
  profileId: string,
  now: Date = new Date(),
): Promise<EvaluationSubmissionResult> {
  const seat = await findOpenEvaluationSeatForApplication(db, campaignAppliedId, profileId, now);
  if (!seat) return { scheduleId: null, completed: false };

  const scheduleId = String(seat.schedule_id);
  await markEvaluationSubmitted(db, scheduleId, profileId);

  if (seat.status === "Completed") return { scheduleId, completed: false };
  const pending = await countPendingEvaluationSeats(db, scheduleId);
  if (pending > 0) return { scheduleId, completed: false };

  await updateCandidateSchedule(db, scheduleId, { status: "Completed" });
  return { scheduleId, completed: true };
}
