import { z } from "zod";

import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requirePermissionForApplication } from "@/lib/authz/require-permission";
import { normalizeEmail, isValidEmail } from "@/lib/auth/email";
import { syncScheduleCalendarEvent } from "@/lib/calendar/sync-schedule";
import {
  addScheduleInterviewer,
  getCandidateScheduleById,
  removeScheduleInterviewer,
} from "@/lib/db/candidate-schedules";
import { getPool } from "@/lib/db/config/client";
import { getUsersByEmails } from "@/lib/db/users";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCHEDULE_ID_RE = /^\d+$/;
const MAX_BULK_EMAILS = 20;

const postBodySchema = z
  .object({
    email: z.string().min(1).optional(),
    emails: z.array(z.string().min(1)).min(1).max(MAX_BULK_EMAILS).optional(),
  })
  .refine((v) => !!v.email || !!v.emails, {
    message: "email or emails is required.",
  });
const deleteBodySchema = z.object({ profileId: z.string().regex(UUID_RE) });

type RouteContext = { params: Promise<{ id: string; scheduleId: string }> };

async function resolveTarget(campaignAppliedId: string, scheduleId: string) {
  if (!UUID_RE.test(campaignAppliedId) || !SCHEDULE_ID_RE.test(scheduleId)) {
    return null;
  }
  const schedule = await getCandidateScheduleById(getPool(), scheduleId);
  if (!schedule || schedule.campaign_applied_id !== campaignAppliedId) return null;
  return schedule;
}

/**
 * Assigns one or more interviewers (by email) to a `candidate_schedules`
 * row, then re-syncs its Graph calendar event **once** (not once per email)
 * so the new attendee(s) are added to the existing invite, or the event is
 * created if these are the first interviewers.
 *
 * `{ email }` is the original single-add shape (still used by the per-card
 * interviewer widget) and keeps its original strict behavior: an unknown
 * email 400s and adds no one. `{ emails: [...] }` (used by the
 * schedule-creation form's bulk auto-fill) is tolerant instead -- unresolved
 * addresses are reported back in `unknownEmails` rather than failing the
 * whole request, since a bad address there shouldn't block adding everyone
 * else who did resolve.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: campaignAppliedId, scheduleId } = await params;
  const manageAccess = await requirePermissionForApplication(
    auth.access,
    "candidate.manage",
    campaignAppliedId,
  );
  if (!manageAccess.ok) return manageAccess.response;

  const schedule = await resolveTarget(campaignAppliedId, scheduleId);
  if (!schedule) {
    return Response.json({ error: "Schedule not found." }, { status: 404 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = postBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json({ error: "email or emails is required." }, { status: 400 });
  }

  const isSingle = !!parsed.data.email;
  const requestedEmails = parsed.data.emails ?? [parsed.data.email!];
  const normalizedEmails = requestedEmails.map(normalizeEmail);
  const validEmails = [...new Set(normalizedEmails.filter(isValidEmail))];
  const invalidEmails = normalizedEmails.filter((e) => !isValidEmail(e));

  const db = getPool();
  const users = validEmails.length ? await getUsersByEmails(db, validEmails) : [];
  const foundByEmail = new Map(users.map((u) => [normalizeEmail(u.email), u]));
  const unknownEmails = [
    ...invalidEmails,
    ...validEmails.filter((e) => !foundByEmail.has(e)),
  ];

  if (isSingle && unknownEmails.length > 0) {
    return Response.json(
      { error: `Unknown account email: ${unknownEmails[0]}` },
      { status: 400 },
    );
  }

  for (const user of users) {
    await addScheduleInterviewer(db, scheduleId, user.id);
  }
  await syncScheduleCalendarEvent(db, schedule);

  return Response.json({
    added: users.map((u) => ({
      profileId: u.id,
      email: u.email,
      displayName: u.display_name,
    })),
    unknownEmails,
  });
}

/** Removes one interviewer from a `candidate_schedules` row, then re-syncs (or cancels, if none remain) its Graph calendar event. */
export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: campaignAppliedId, scheduleId } = await params;
  const manageAccess = await requirePermissionForApplication(
    auth.access,
    "candidate.manage",
    campaignAppliedId,
  );
  if (!manageAccess.ok) return manageAccess.response;

  const schedule = await resolveTarget(campaignAppliedId, scheduleId);
  if (!schedule) {
    return Response.json({ error: "Schedule not found." }, { status: 404 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = deleteBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json({ error: "profileId is required." }, { status: 400 });
  }

  const db = getPool();
  await removeScheduleInterviewer(db, scheduleId, parsed.data.profileId);
  await syncScheduleCalendarEvent(db, schedule);

  return Response.json({ ok: true });
}
