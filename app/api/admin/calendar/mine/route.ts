import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { displayName, loadSessions, sessionDuration } from "@/lib/calendar/server";
import { getPool } from "@/lib/db/config/client";
import { getUsersByIds } from "@/lib/db/users";
import { logApiError } from "@/lib/logger";
import { NextRequest } from "next/server";

/** Sessions that ended this long ago still show while an evaluation is open. */
const LOOKBACK_DAYS = 30;
const LOOKAHEAD_DAYS = 90;
const DAY_MS = 86_400_000;
/** Evaluations are due 24 hours after the interview ends. */
const EVAL_WINDOW_MS = 24 * 3_600_000;

/**
 * The viewer's own interviewer seats across all positions: upcoming interviews
 * and ones that ended without an evaluation. Declined seats are excluded.
 */
export async function GET(request: NextRequest) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const me = auth.userId;
  const db = getPool();
  const now = new Date();

  try {
    const sessions = await loadSessions(
      db,
      new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS),
      new Date(now.getTime() + LOOKAHEAD_DAYS * DAY_MS),
      [me],
    );

    const mine = [];
    for (const s of sessions) {
      const seat = s.seats.find((x) => x.profile_id === me);
      if (!seat || seat.declined_at) continue;
      const start = new Date(s.row.scheduled_at);
      const durationMin = sessionDuration(s.row);
      const end = new Date(start.getTime() + durationMin * 60_000);
      const submitted = seat.evaluation_submitted_at !== null;
      const upcoming =
        (s.row.status === "Scheduled" || s.row.status === "Confirmed") && start > now;
      const pendingEvaluation =
        !submitted && end <= now && s.row.status !== "NoShow" && s.row.status !== "Canceled";
      if (!upcoming && !pendingEvaluation) continue;
      mine.push({
        id: String(s.row.id),
        start: start.toISOString(),
        end: end.toISOString(),
        durationMin,
        round: s.row.round_label,
        status: s.row.status,
        mode: s.row.mode,
        location: s.row.location,
        meetingLink: s.row.meeting_link,
        campaignAppliedId: s.row.campaign_applied_id,
        candidateId: s.row.candidate_id,
        candidateName: s.row.candidate_name,
        jobId: s.row.job_id,
        organizerId: s.row.created_by,
        submitted,
        upcoming,
        pendingEvaluation,
        evaluationDueAt: new Date(end.getTime() + EVAL_WINDOW_MS).toISOString(),
        overdue: pendingEvaluation && end.getTime() + EVAL_WINDOW_MS < now.getTime(),
      });
    }

    const organizerIds = [...new Set(mine.map((m) => m.organizerId).filter((x): x is string => !!x))];
    const users = organizerIds.length ? await getUsersByIds(db, organizerIds) : [];
    const names = new Map(users.map((u) => [u.id, displayName(u)]));

    return Response.json({
      interviews: mine.map((m) => ({
        ...m,
        organizerName: m.organizerId ? (names.get(m.organizerId) ?? null) : null,
      })),
    });
  } catch (e) {
    logApiError("Calendar mine: query failed", e, { userId: me });
    return Response.json({ error: "Could not load your interviews." }, { status: 500 });
  }
}
