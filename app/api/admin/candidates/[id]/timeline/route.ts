import { z } from "zod";


import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requirePermissionForApplication } from "@/lib/authz/require-permission";
import { requireJobViewForApplication } from "@/lib/authz/require-application-job-view";
import { getCampaignAppliedById } from "@/lib/db/campaign-applied";
import {
  createCandidateSchedule,
  getCandidateScheduleById,
  listCandidateSchedulesByCampaignApplied,
  updateCandidateSchedule,
  type CandidateScheduleRow,
} from "@/lib/db/candidate-schedules";
import { getPool, withTransaction } from "@/lib/db/config/client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isoDateTime = z.string().refine(
  (s) => s.length > 0 && Number.isFinite(Date.parse(s)),
  "Invalid ISO datetime",
);

const ACTIVE_STATUSES = new Set<CandidateScheduleRow["status"]>(["Scheduled", "Confirmed"]);

/**
 * `scheduleId` omitted -> always creates a new, independent schedule row (so
 * a candidate can have several active schedules at once -- e.g. two
 * interview rounds, or an interview and an onboarding session, in parallel).
 * `scheduleId` + `status: "Canceled"` -> cancels that specific row in place.
 * `scheduleId` + `scheduledAt` -> updates/reschedules that specific row only
 * (never "whichever schedule happens to be active" -- there may be several).
 */
// candidate_schedules.id is a bigint identity column, not a uuid (unlike campaign_applied.id).
const SCHEDULE_ID_RE = /^\d+$/;

const bodySchema = z
  .object({
    scheduleId: z.string().regex(SCHEDULE_ID_RE).optional(),
    status: z.literal("Canceled").optional(),
    scheduledAt: isoDateTime.optional(),
    roundLabel: z.string().max(200).optional(),
    durationMinutes: z.number().int().positive().optional(),
    location: z.string().max(500).optional(),
  })
  .strict()
  .refine((v) => v.status === "Canceled" ? !!v.scheduleId : !!v.scheduledAt, {
    message: "scheduledAt is required unless cancelling an existing schedule.",
  });

type RouteContext = { params: Promise<{ id: string }> };

/** Schedule history for the row's "past rounds" list — most recent first (see `listCandidateSchedulesByCampaignApplied`'s ORDER BY). */
export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
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

  const schedules = await listCandidateSchedulesByCampaignApplied(
    getPool(),
    campaignAppliedId,
  );
  return Response.json({ schedules });
}

/**
 * Creates, updates/reschedules, or cancels a `candidate_schedules` row for
 * this application. Replaces the old flat `candidates.interview_at`/
 * `onboarding_at` columns, both dropped in DB7X2K (see
 * SmartHire/logs/DB7X2K-schema-redesign-2026-07-10/06-...-slice1.md): interview
 * scheduling now has a real home in `candidate_schedules`, and onboarding-date
 * tracking isn't carried forward at all (no replacement -- only `hired_at` on
 * `campaign_applied` remains as a cache column for when that's implemented).
 *
 * A schedule can be created regardless of the application's current pipeline
 * stage (not just "Interview") -- the previous stage-code gate was specific
 * to interview scheduling and no longer applies now that this endpoint
 * covers any kind of candidate schedule. Several schedules can also be
 * active (`Scheduled`/`Confirmed`) at once for the same application (e.g.
 * two interview rounds, or an interview and an onboarding session, running
 * in parallel) -- there is no more "the one active schedule" singleton.
 *
 * `scheduleId` selects which existing row an update/reschedule/cancel
 * applies to; omitting it always inserts a brand-new, independent row.
 * Changing `scheduledAt` on an existing row creates a *new* schedule row
 * linked back via `rescheduled_from_id` and marks the old one
 * `"Rescheduled"`, per this table's own design comment ("a reschedule
 * creates a new row"), not an in-place timestamp overwrite -- this preserves
 * a reschedule history the old single-column design couldn't.
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

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }
  const { scheduleId, status, scheduledAt, roundLabel, durationMinutes, location } = parsed.data;

  const db = getPool();

  const campaignApplied = await getCampaignAppliedById(db, campaignAppliedId);
  if (!campaignApplied) {
    return Response.json({ error: "Application not found." }, { status: 404 });
  }

  // Cancel a specific existing schedule -- no new row, no reschedule chain.
  if (status === "Canceled") {
    const target = await getCandidateScheduleById(db, scheduleId!);
    if (!target || target.campaign_applied_id !== campaignAppliedId) {
      return Response.json({ error: "Schedule not found." }, { status: 404 });
    }
    const result = await updateCandidateSchedule(db, scheduleId!, { status: "Canceled" });
    return Response.json({ schedule: result ?? target });
  }

  // No scheduleId -- always create a new, independent schedule row.
  // `jobStageMappingId` is nullable on candidate_schedules, so this works
  // even when the application has no pipeline stage assigned yet.
  if (!scheduleId) {
    try {
      const result = await createCandidateSchedule(db, {
        campaignAppliedId,
        jobStageMappingId: campaignApplied.current_job_stage_mapping_id,
        roundLabel,
        scheduledAt: scheduledAt!,
        durationMinutes,
        location,
        createdBy: auth.userId,
      });
      return Response.json({ schedule: result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save schedule.";
      return Response.json({ error: msg }, { status: 500 });
    }
  }

  // scheduleId given -- update or reschedule that specific row only.
  const target = await getCandidateScheduleById(db, scheduleId);
  if (!target || target.campaign_applied_id !== campaignAppliedId) {
    return Response.json({ error: "Schedule not found." }, { status: 404 });
  }
  if (!ACTIVE_STATUSES.has(target.status)) {
    return Response.json(
      { error: "This schedule is no longer active and can't be edited." },
      { status: 400 },
    );
  }

  const scheduledAtChanged =
    target.scheduled_at.toISOString() !== new Date(scheduledAt!).toISOString();

  let result: CandidateScheduleRow;
  try {
    if (!scheduledAtChanged) {
      result = (await updateCandidateSchedule(db, target.id, { roundLabel, durationMinutes, location })) ?? target;
    } else {
      result = await withTransaction(async (tx) => {
        await updateCandidateSchedule(tx, target.id, { status: "Rescheduled" });
        return createCandidateSchedule(tx, {
          campaignAppliedId,
          jobStageMappingId: campaignApplied.current_job_stage_mapping_id,
          roundLabel,
          scheduledAt: scheduledAt!,
          durationMinutes,
          location,
          rescheduledFromId: target.id,
          createdBy: auth.userId,
        });
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to save schedule.";
    return Response.json({ error: msg }, { status: 500 });
  }

  return Response.json({ schedule: result });
}
