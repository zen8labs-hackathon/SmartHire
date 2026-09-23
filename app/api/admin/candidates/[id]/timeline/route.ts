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
import {
  getJobStageMappingById,
  getPipelineStageById,
} from "@/lib/db/pipeline-stages";

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
    durationMinutes: z.number().int().positive().optional(),
    location: z.string().max(500).optional(),
    // Present -> reschedule/update exactly this round (whatever stage it
    // belongs to). Omitted -> always create a brand-new, independent round
    // on the application's current stage. See the PATCH handler's docstring
    // for why this can't be inferred server-side.
    scheduleId: z.string().regex(/^\d+$/, "Invalid schedule ID").optional(),
  })
  .strict();

// `candidate_schedules.id` is a `bigint identity`, not a uuid like most
// other tables (see migrations/1783914205879_candidate-schedules-and-notes.sql) --
// validate it as a numeric string, not with `UUID_RE`.
const deleteBodySchema = z
  .object({
    scheduleId: z.string().regex(/^\d+$/, "Invalid schedule ID"),
  })
  .strict();

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
  const { scheduledAt, roundLabel, durationMinutes, location, scheduleId } =
    parsed.data;

  const db = getPool();

  const campaignApplied = await getCampaignAppliedById(db, campaignAppliedId);
  if (!campaignApplied) {
    return Response.json({ error: "Application not found." }, { status: 404 });
  }

  let result: CandidateScheduleRow;
  try {
    if (scheduleId) {
      // "Edit": reschedule/update the exact round the caller named, on
      // whatever stage it originally belonged to.
      const existing = await getCandidateScheduleById(db, scheduleId);
      if (!existing || existing.campaign_applied_id !== campaignAppliedId) {
        return Response.json({ error: "Schedule not found." }, { status: 404 });
      }
      if (existing.status !== "Scheduled" && existing.status !== "Confirmed") {
        return Response.json(
          { error: "Only an active round can be edited." },
          { status: 400 },
        );
      }

      const scheduledAtChanged =
        existing.scheduled_at.toISOString() !==
        new Date(scheduledAt).toISOString();

      if (!scheduledAtChanged) {
        result =
          (await updateCandidateSchedule(db, existing.id, {
            roundLabel,
            durationMinutes,
            location,
          })) ?? existing;
      } else {
        result = await withTransaction(async (tx) => {
          await updateCandidateSchedule(tx, existing.id, {
            status: "Rescheduled",
          });
          return createCandidateSchedule(tx, {
            campaignAppliedId,
            jobStageMappingId: existing.job_stage_mapping_id,
            roundLabel,
            scheduledAt,
            durationMinutes,
            location,
            rescheduledFromId: existing.id,
            createdBy: auth.userId,
          });
        });
      }
    } else {
      // "Add new": always an independent round on the current stage.
      if (!campaignApplied.current_job_stage_mapping_id) {
        return Response.json(
          { error: "Application has no pipeline stage assigned." },
          { status: 400 },
        );
      }

      const stageMapping = await getJobStageMappingById(
        db,
        campaignApplied.current_job_stage_mapping_id,
      );
      const stage = stageMapping
        ? await getPipelineStageById(db, stageMapping.pipeline_stage_id)
        : null;
      if (!stage?.allow_schedule) {
        return Response.json(
          {
            error:
              "Scheduling is not enabled for the application's current stage.",
          },
          { status: 400 },
        );
      }

      result = await createCandidateSchedule(db, {
        campaignAppliedId,
        jobStageMappingId: campaignApplied.current_job_stage_mapping_id,
        roundLabel,
        scheduledAt,
        durationMinutes,
        location,
        createdBy: auth.userId,
      });
    }
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to save interview schedule.";
    return Response.json({ error: msg }, { status: 500 });
  }

  return Response.json({ schedule: result });
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

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = deleteBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }

  const db = getPool();
  const schedule = await getCandidateScheduleById(db, parsed.data.scheduleId);
  if (!schedule || schedule.campaign_applied_id !== campaignAppliedId) {
    return Response.json({ error: "Schedule not found." }, { status: 404 });
  }
  if (schedule.status !== "Scheduled" && schedule.status !== "Confirmed") {
    return Response.json(
      { error: "Only the active schedule can be canceled." },
      { status: 400 },
    );
  }

  const result = await updateCandidateSchedule(db, schedule.id, {
    status: "Canceled",
  });
  return Response.json({ schedule: result });
}
