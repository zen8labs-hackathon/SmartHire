import { guardLegacyApplication } from "@/lib/migration/legacy-flow-guard";
import { z } from "zod";

import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requireApplicationViewOrSeat } from "@/lib/authz/require-application-view-or-seat";
import { ownerDisplayName } from "@/lib/calendar/busy";
import { canManageInterviews } from "@/lib/calendar/authz";
import { calendarHref, notifyUsers } from "@/lib/calendar/notify";
import { invalidJson, readJson } from "@/lib/calendar/validation";
import {
  getCandidateScheduleById,
  listScheduleInterviewers,
  updateCandidateSchedule,
} from "@/lib/db/candidate-schedules";
import { getPool } from "@/lib/db/config/client";
import { logApiError } from "@/lib/logger";
import { NOTIFICATION_TYPE } from "@/lib/redis/channels";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

// `candidate_schedules.id` is a bigint identity -- numeric string, not a uuid.
const bodySchema = z
  .object({ scheduleId: z.string().regex(/^\d+$/, "Invalid schedule ID") })
  .strict();

/**
 * BR-INT-09/10: mark a started session as a no-show (the whole session, not
 * one seat). HR / Recruiter / Admin, or an interviewer holding a non-declined
 * seat on it. The candidate's stage is left alone (BR-INT-11).
 */
export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: campaignAppliedId } = await params;
  if (!campaignAppliedId || !UUID_RE.test(campaignAppliedId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const appAccess = await requireApplicationViewOrSeat(
    auth.access,
    auth.userId,
    campaignAppliedId,
  );
  if (!appAccess.ok) return appAccess.response;
  const legacy = await guardLegacyApplication(campaignAppliedId);
  if (legacy) return legacy;

  const json = await readJson(request);
  if (json === undefined) return invalidJson();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }

  const db = getPool();
  try {
    const schedule = await getCandidateScheduleById(db, parsed.data.scheduleId);
    if (!schedule || schedule.campaign_applied_id !== campaignAppliedId) {
      return Response.json({ error: "Schedule not found." }, { status: 404 });
    }

    const seats = await listScheduleInterviewers(db, String(schedule.id));
    const hasSeat = seats.some((s) => s.profile_id === auth.userId && !s.declined_at);
    if (!canManageInterviews(auth.access) && !hasSeat) {
      return Response.json(
        { error: "Only HR, a recruiter or an interviewer of this session can mark a no-show." },
        { status: 403 },
      );
    }
    if (schedule.status !== "Scheduled" && schedule.status !== "Confirmed") {
      return Response.json(
        { error: "Only an active session can be marked as no-show." },
        { status: 400 },
      );
    }
    if (new Date(schedule.scheduled_at).getTime() > Date.now()) {
      return Response.json(
        { error: "The session has not started yet." },
        { status: 400 },
      );
    }

    const result = await updateCandidateSchedule(db, schedule.id, { status: "NoShow" });

    const recipients = [
      ...new Set([
        ...seats.filter((s) => !s.declined_at).map((s) => s.profile_id),
        schedule.created_by,
      ]),
    ].filter((x): x is string => !!x && x !== auth.userId);
    if (recipients.length > 0) {
      const round = schedule.round_label ?? "Interview";
      const name = await ownerDisplayName(db, auth.userId);
      await notifyUsers(db, recipients, {
        type: NOTIFICATION_TYPE.InterviewNoShow,
        title: `${name} marked ${round} as no-show`,
        body: "The candidate did not attend. Schedule a new session if needed.",
        data: {
          scheduleId: String(schedule.id),
          campaignAppliedId,
          href: calendarHref(String(schedule.id), schedule.scheduled_at),
        },
      });
    }

    return Response.json({ schedule: result });
  } catch (e) {
    logApiError("Timeline: mark no-show failed", e, { userId: auth.userId });
    return Response.json({ error: "Could not mark the no-show." }, { status: 500 });
  }
}
