import { guardLegacyJob } from "@/lib/migration/legacy-flow-guard";
import { z } from "zod";

import {
  requireStaffForRequest,
  requireUserForRequest,
} from "@/lib/admin/require-staff-request";
import { requirePermissionForApplication } from "@/lib/authz/require-permission";
import { requireJobViewForApplication } from "@/lib/authz/require-application-job-view";
import {
  cancelRound,
  listRoundsForApplication,
  saveRound,
} from "@/lib/calendar/application-rounds";
import { canManageInterviews } from "@/lib/calendar/authz";
import { invalidJson, readJson } from "@/lib/calendar/validation";


const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isoDateTime = z
  .string()
  .refine(
    (s) => s.length > 0 && Number.isFinite(Date.parse(s)),
    "Invalid ISO datetime",
  );

const bodySchema = z
  .object({
    scheduledAt: isoDateTime,
    roundLabel: z.string().max(200).optional(),
    durationMinutes: z.number().int().positive().max(480).optional(),
    location: z.string().max(500).optional(),
    // Present -> reschedule/update exactly this round (whatever stage it
    // belongs to). Omitted -> always create a brand-new, independent round
    // on the application's current stage. See the PATCH handler's docstring
    // for why this can't be inferred server-side.
    scheduleId: z.string().regex(/^\d+$/, "Invalid schedule ID").optional(),
    // Omitted on an edit -> keep the round's current interviewers.
    interviewerIds: z
      .array(z.string().regex(UUID_RE, "Invalid interviewer ID"))
      .max(10, "Assign at most 10 interviewers.")
      .optional(),
    mode: z.enum(["online", "office"]).optional(),
    meetingLink: z.string().trim().max(1000).optional(),
    note: z.string().max(2000).optional(),
    // Required when the time of an existing round changes.
    reason: z
      .string()
      .max(500, "Keep the reason under 500 characters.")
      .optional(),
    acknowledgeSoft: z.boolean().optional(),
    // Sent by the shared ScheduleDialog (Position Management 2, Calendar-2).
    // Opts into the newer rules -- required interviewers/office location and
    // the reschedule email. The legacy /admin/jd/[jobId]/pipeline page omits
    // it and keeps its old behavior.
    strict: z.boolean().optional(),
  })
  .strict();

// `candidate_schedules.id` is a `bigint identity`, not a uuid like most
// other tables (see migrations/1783914205879_candidate-schedules-and-notes.sql) --
// validate it as a numeric string, not with `UUID_RE`.
const deleteBodySchema = z
  .object({
    scheduleId: z.string().regex(/^\d+$/, "Invalid schedule ID"),
    reason: z
      .string()
      .trim()
      .min(1, "Give a reason for canceling.")
      .max(500, "Keep the reason under 500 characters."),
  })
  .strict();

const toResponse = (r: { status: number; body: unknown }) =>
  Response.json(r.body, { status: r.status });

type RouteContext = { params: Promise<{ id: string }> };

/** Schedule history for the row's "past rounds" list — most recent first (see `listCandidateSchedulesByCampaignApplied`'s ORDER BY). */
export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireUserForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: campaignAppliedId } = await params;
  if (!campaignAppliedId || !UUID_RE.test(campaignAppliedId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const appAccess = await requireJobViewForApplication(
    auth.access,
    campaignAppliedId,
  );
  if (!appAccess.ok) return appAccess.response;

  return toResponse(await listRoundsForApplication(auth, campaignAppliedId));
}

/**
 * Sets/reschedules the application's interview time as a `candidate_schedules`
 * row. Replaces the old flat `candidates.interview_at`/`onboarding_at`
 * columns, both dropped in DB7X2K (see
 * SmartHire/logs/DB7X2K-schema-redesign-2026-07-10/06-...-slice1.md): interview
 * scheduling now has a real home in `candidate_schedules`, and onboarding-date
 * tracking isn't carried forward at all (no replacement -- only `hired_at` on
 * `campaign_applied` remains as a cache column for when that's implemented).
 *
 * A change to an already-scheduled interview creates a *new* schedule row
 * linked back via `rescheduled_from_id` and marks the old one `"Rescheduled"`,
 * per this table's own design comment ("a reschedule creates a new row"), not
 * an in-place timestamp overwrite -- this preserves a reschedule history the
 * old single-column design couldn't.
 *
 * Which round gets touched is driven entirely by the request body's
 * `scheduleId`, not an implicit "whichever round looks active" guess:
 *   - `scheduleId` given -- reschedules/updates *that exact round*, on
 *     whatever stage it originally belonged to. This is what the UI's
 *     "Edit" (pencil) on a specific history card sends.
 *   - `scheduleId` omitted -- always creates a brand-new, independent round
 *     on the application's *current* stage, even if another round (same or
 *     different stage) is still Scheduled/Confirmed. This is "Add new".
 * An earlier version inferred the round to reschedule by finding "any
 * Scheduled/Confirmed row" (later scoped to the current stage) -- both were
 * still guesses, and both meant a candidate could only ever have one round
 * open at a time: saving a second round silently rescheduled-away the
 * first instead of creating an independent one. Making the target explicit
 * is what actually lets multiple rounds coexist and each be edited on its
 * own.
 *
 * Creating a new round is gated by `pipeline_stages.allow_schedule` on the
 * application's *current* stage (not a hardcoded `code === "interview"`:
 * pipelines are fully custom per job, see
 * migrations/1783914203310_pipeline-stages.sql, so a job may have zero
 * "interview"-coded stages or several interview-like stages under different
 * codes -- admins opt individual stages into scheduling from the Pipelines
 * admin UI). Rescheduling an existing round by id isn't re-gated on that --
 * the round already exists, and the candidate may have moved past the stage
 * it was booked under.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: campaignAppliedId } = await params;
  if (!campaignAppliedId || !UUID_RE.test(campaignAppliedId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const manageAccess = await requirePermissionForApplication(
    auth.access,
    "candidate.manage",
    campaignAppliedId,
  );
  if (!manageAccess.ok) return manageAccess.response;
  const legacy = await guardLegacyJob(manageAccess.application.job_id);
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
  return toResponse(await saveRound(auth, campaignAppliedId, parsed.data));
}

/**
 * Cancels the application's active schedule (status -> `"Canceled"`). There's
 * no hard-delete here -- `candidate_schedules` intentionally has no
 * `deleted_at` (see lib/db/candidate-schedules.ts's table comment), so a
 * "delete" from the UI is a status change that keeps the row -- and the
 * reschedule chain it may be part of -- intact. Only a round still
 * `"Scheduled"`/`"Confirmed"` can be canceled; every other status
 * (`Rescheduled`/`Canceled`/`Completed`/`NoShow`) is already terminal.
 */
export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: campaignAppliedId } = await params;
  if (!campaignAppliedId || !UUID_RE.test(campaignAppliedId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const manageAccess = await requirePermissionForApplication(
    auth.access,
    "candidate.manage",
    campaignAppliedId,
  );
  if (!manageAccess.ok) return manageAccess.response;
  const legacy = await guardLegacyJob(manageAccess.application.job_id);
  if (legacy) return legacy;
  // BR-INT-01: only HR, Admin and Recruiters manage interview sessions.
  if (!canManageInterviews(auth.access)) {
    return Response.json(
      { error: "Only HR or a recruiter can manage interview schedules." },
      { status: 403 },
    );
  }

  const json = await readJson(request);
  if (json === undefined) return invalidJson();
  const parsed = deleteBodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }
  const { scheduleId, reason } = parsed.data;
  return toResponse(
    await cancelRound(auth, campaignAppliedId, scheduleId, reason),
  );
}
