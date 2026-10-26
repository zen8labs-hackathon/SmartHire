import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { filterViewableJobIds } from "@/lib/authz/can";
import { canReschedule, canSeeSession, isAssignedInterviewer } from "@/lib/calendar/authz";
import { busyRange, displayName, loadBusy, loadSessions, sessionDuration } from "@/lib/calendar/server";
import { addDays, diffDays, fromLocal, todayInTz, weekStart } from "@/lib/calendar/time";
import { UUID_RE, badRequest, isIsoDate } from "@/lib/calendar/validation";
import { getWorkingHours } from "@/lib/db/company-settings";
import { getPool } from "@/lib/db/config/client";
import { getUsersByIds } from "@/lib/db/users";
import { logApiError } from "@/lib/logger";
import { NextRequest } from "next/server";

const MAX_SPAN_DAYS = 42;
/** The calendar looks at most four weeks past the current one (BR-01). */
const FORWARD_WEEKS = 4;
/** The header counts the viewer's interviews over this many calendar days, today included. */
const UPCOMING_DAYS = 90;
const MAX_PEOPLE = 3;

type Lane = { kind: "busy" | "interview"; start: string; end: string };

/**
 * Calendar feed: the viewer's visible sessions and busy time in `[from, to]`
 * (inclusive GMT+7 dates), plus reduced busy/interview lanes for up to three
 * other people being compared.
 */
export async function GET(request: NextRequest) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  if (!isIsoDate(from) || !isIsoDate(to)) {
    return badRequest("from and to must be YYYY-MM-DD dates.");
  }
  const span = diffDays(from, to);
  if (span < 0 || span >= MAX_SPAN_DAYS) {
    return badRequest(`The range must cover 1 to ${MAX_SPAN_DAYS} days.`);
  }
  const today = todayInTz();
  const lastDay = addDays(weekStart(today), (FORWARD_WEEKS + 1) * 7 - 1);
  if (diffDays(lastDay, to) > 0) {
    return badRequest(`The calendar shows at most ${FORWARD_WEEKS} weeks ahead.`);
  }

  const peopleParam = searchParams.get("people")?.trim() ?? "";
  const people = [
    ...new Set(
      peopleParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ].filter((id) => id !== auth.userId);
  const access0 = auth.access;
  if (people.length > 0 && !(access0.isAdmin || access0.isHr || access0.role === "recruiter")) {
    return Response.json({ error: "You can't compare other people's calendars." }, { status: 403 });
  }
  if (people.length > MAX_PEOPLE) {
    return badRequest(`Compare at most ${MAX_PEOPLE} people.`);
  }
  if (people.some((id) => !UUID_RE.test(id))) {
    return badRequest("people must be user ids.");
  }

  const me = auth.userId;
  const access = auth.access;
  const db = getPool();

  try {
    const rangeStart = fromLocal(from, 0);
    const rangeEnd = fromLocal(addDays(to, 1), 0);
    const now = new Date();
    const [sessions, upcoming, busy, hours, users] = await Promise.all([
      loadSessions(db, rangeStart, rangeEnd, [me, ...people]),
      loadSessions(db, now, fromLocal(addDays(today, UPCOMING_DAYS), 0), [me]),
      loadBusy(db, [me, ...people], from, to),
      getWorkingHours(db),
      getUsersByIds(db, [me, ...people]),
    ]);

    const viewableJobs = await filterViewableJobIds(
      db,
      access,
      sessions.map((s) => s.row.job_id),
    );

    const visible = [];
    for (const s of sessions) {
      const info = {
        createdBy: s.row.created_by,
        interviewerIds: s.activeInterviewerIds, // BR-INT-06: a declined seat grants no view
      };
      const canViewJob = viewableJobs.has(s.row.job_id);
      if (!canSeeSession(access, info, { canViewJob })) continue;
      const start = new Date(s.row.scheduled_at);
      const durationMin = sessionDuration(s.row);
      visible.push({
        id: String(s.row.id),
        start: start.toISOString(),
        end: new Date(start.getTime() + durationMin * 60_000).toISOString(),
        durationMin,
        round: s.row.round_label,
        status: s.row.status,
        mode: s.row.mode,
        location: s.row.location,
        meetingLink: s.row.meeting_link,
        note: s.row.note,
        campaignAppliedId: s.row.campaign_applied_id,
        candidateId: s.row.candidate_id,
        candidateName: s.row.candidate_name,
        jobId: s.row.job_id,
        organizerId: s.row.created_by,
        interviewers: s.seats.map((x) => ({
          id: x.profile_id,
          declinedAt: x.declined_at,
          declineReason: x.decline_reason,
          submitted: x.evaluation_submitted_at !== null,
        })),
        noInterviewer: s.row.no_interviewer_flag,
        canEdit: canReschedule(access, info),
        limited:
          !access.isAdmin &&
          !access.isHr &&
          !canViewJob &&
          isAssignedInterviewer(access, info),
      });
    }

    const lanes: Record<string, Lane[]> = {};
    for (const personId of people) {
      const lane: Lane[] = [];
      for (const s of sessions) {
        const involved =
          s.row.created_by === personId || s.activeInterviewerIds.includes(personId);
        if (!involved) continue;
        const start = new Date(s.row.scheduled_at);
        lane.push({
          kind: "interview",
          start: start.toISOString(),
          end: new Date(start.getTime() + sessionDuration(s.row) * 60_000).toISOString(),
        });
      }
      for (const o of busy) {
        if (o.ownerId !== personId) continue;
        const r = busyRange(o);
        lane.push({ kind: "busy", start: r.start.toISOString(), end: r.end.toISOString() });
      }
      lane.sort((a, b) => a.start.localeCompare(b.start));
      lanes[personId] = lane;
    }

    return Response.json({
      range: { from, to },
      hours,
      me,
      people: users.map((u) => ({
        id: u.id,
        name: displayName(u),
        email: u.email,
        role: u.role,
      })),
      sessions: visible,
      busy: busy.filter((o) => o.ownerId === me),
      lanes,
      upcomingCount: upcoming.filter(
        (s) =>
          s.row.status === "Scheduled" && s.activeInterviewerIds.includes(me),
      ).length,
    });
  } catch (e) {
    logApiError("Calendar feed: query failed", e, { userId: auth.userId });
    return Response.json({ error: "Could not load the calendar." }, { status: 500 });
  }
}
