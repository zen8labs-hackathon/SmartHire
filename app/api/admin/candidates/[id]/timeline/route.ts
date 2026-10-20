import { z } from "zod";

import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requirePermissionForApplication } from "@/lib/authz/require-permission";
import { requireJobViewForApplication } from "@/lib/authz/require-application-job-view";
import { getCampaignAppliedById } from "@/lib/db/campaign-applied";
import { ownerDisplayName } from "@/lib/calendar/busy";
import { checkConflicts, hasBlocking } from "@/lib/calendar/conflicts";
import { notifyUsers } from "@/lib/calendar/notify";
import { DEFAULT_DURATION_MIN, loadConflictContext } from "@/lib/calendar/server";
import { invalidJson, readJson } from "@/lib/calendar/validation";
import {
  addScheduleInterviewer,
  createCandidateSchedule,
  getCandidateScheduleById,
  listCandidateSchedulesByCampaignApplied,
  listScheduleInterviewers,
  removeScheduleInterviewer,
  updateCandidateSchedule,
  type CandidateScheduleRow,
} from "@/lib/db/candidate-schedules";
import { getPool, withTransaction } from "@/lib/db/config/client";
import {
  getJobStageMappingById,
  getPipelineStageById,
} from "@/lib/db/pipeline-stages";
import { logApiError } from "@/lib/logger";
import { NOTIFICATION_TYPE } from "@/lib/redis/channels";

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
    reason: z.string().max(500, "Keep the reason under 500 characters.").optional(),
    acknowledgeSoft: z.boolean().optional(),
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

  const db = getPool();
  const rows = await listCandidateSchedulesByCampaignApplied(
    db,
    campaignAppliedId,
  );
  const schedules = await Promise.all(
    rows.map(async (r) => ({
      ...r,
      interviewers: (await listScheduleInterviewers(db, String(r.id))).map(
        (i) => i.profile_id,
      ),
    })),
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

  const json = await readJson(request);
  if (json === undefined) return invalidJson();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const { scheduledAt, scheduleId } = body;
  const reason = body.reason?.trim() || undefined;

  const db = getPool();
  try {
    const campaignApplied = await getCampaignAppliedById(db, campaignAppliedId);
    if (!campaignApplied) {
      return Response.json({ error: "Application not found." }, { status: 404 });
    }

    let existing: CandidateScheduleRow | null = null;
    let existingSeatIds: string[] = [];
    let jobStageMappingId: string | null;

    if (scheduleId) {
      // "Edit": reschedule/update the exact round the caller named, on
      // whatever stage it originally belonged to.
      existing = await getCandidateScheduleById(db, scheduleId);
      if (!existing || existing.campaign_applied_id !== campaignAppliedId) {
        return Response.json({ error: "Schedule not found." }, { status: 404 });
      }
      if (existing.status !== "Scheduled" && existing.status !== "Confirmed") {
        return Response.json(
          { error: "Only an active round can be edited." },
          { status: 400 },
        );
      }
      existingSeatIds = (await listScheduleInterviewers(db, existing.id)).map(
        (s) => s.profile_id,
      );
      jobStageMappingId = existing.job_stage_mapping_id;
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
      jobStageMappingId = campaignApplied.current_job_stage_mapping_id;
    }

    const start = new Date(scheduledAt);
    const timeChanged =
      existing !== null &&
      existing.scheduled_at.toISOString() !== start.toISOString();
    if (timeChanged && !reason) {
      return Response.json(
        { error: "Give a reason for rescheduling." },
        { status: 400 },
      );
    }

    const interviewerIds = body.interviewerIds
      ? [...new Set(body.interviewerIds)]
      : existingSeatIds;
    const durationMin =
      body.durationMinutes ?? existing?.duration_minutes ?? DEFAULT_DURATION_MIN;

    const ctx = await loadConflictContext(db, auth.access, {
      start,
      interviewerIds,
      candidateId: campaignApplied.candidate_id,
    });
    const issues = checkConflicts(
      {
        start,
        durationMin,
        interviewerIds,
        candidateKey: campaignApplied.candidate_id,
        jobId: campaignApplied.job_id ?? "",
        excludeId: existing ? String(existing.id) : undefined,
      },
      ctx,
    );
    const acknowledgeSoft = body.acknowledgeSoft ?? false;
    if (hasBlocking(issues, acknowledgeSoft)) {
      return Response.json({ issues }, { status: 409 });
    }
    const softConflictsAcknowledged =
      acknowledgeSoft && issues.some((i) => i.level === "soft");

    const result = await withTransaction(async (tx) => {
      if (existing && !timeChanged) {
        const updated =
          (await updateCandidateSchedule(tx, existing.id, {
            roundLabel: body.roundLabel,
            durationMinutes: body.durationMinutes,
            location: body.location,
            mode: body.mode,
            meetingLink: body.meetingLink,
            note: body.note,
            softConflictsAcknowledged,
          })) ?? existing;
        if (body.interviewerIds) {
          for (const pid of existingSeatIds) {
            if (!interviewerIds.includes(pid)) {
              await removeScheduleInterviewer(tx, existing.id, pid);
            }
          }
          for (const pid of interviewerIds) {
            if (!existingSeatIds.includes(pid)) {
              await addScheduleInterviewer(tx, existing.id, pid);
            }
          }
        }
        return updated;
      }

      if (existing) {
        await updateCandidateSchedule(tx, existing.id, { status: "Rescheduled" });
      }
      const created = await createCandidateSchedule(tx, {
        campaignAppliedId,
        jobStageMappingId,
        roundLabel: body.roundLabel ?? existing?.round_label,
        scheduledAt,
        durationMinutes: body.durationMinutes ?? existing?.duration_minutes,
        location: body.location ?? existing?.location,
        mode: body.mode ?? existing?.mode,
        meetingLink: body.meetingLink ?? existing?.meeting_link,
        note: body.note ?? existing?.note,
        rescheduledFromId: existing?.id,
        rescheduleReason: existing ? reason : undefined,
        softConflictsAcknowledged,
        createdBy: existing?.created_by ?? auth.userId,
      });
      for (const pid of interviewerIds) {
        await addScheduleInterviewer(tx, created.id, pid);
      }
      return created;
    });

    const round = result.round_label ?? "Interview";
    const name = await ownerDisplayName(db, auth.userId);
    const data = { scheduleId: String(result.id), campaignAppliedId };
    const others = (ids: (string | null)[]) =>
      ids.filter((x): x is string => !!x && x !== auth.userId);
    const when = start.toISOString();

    if (!existing) {
      await notifyUsers(db, others(interviewerIds), {
        type: NOTIFICATION_TYPE.InterviewScheduled,
        title: `${name} added you to ${round}`,
        data: { ...data, start: when },
      });
    } else if (timeChanged) {
      await notifyUsers(
        db,
        others([...new Set([...interviewerIds, existing.created_by])]),
        {
          type: NOTIFICATION_TYPE.InterviewRescheduled,
          title: `${name} rescheduled ${round}`,
          body: reason,
          data: { ...data, start: when, previousScheduleId: String(existing.id) },
        },
      );
    } else {
      const added = interviewerIds.filter((x) => !existingSeatIds.includes(x));
      await notifyUsers(db, others(added), {
        type: NOTIFICATION_TYPE.InterviewScheduled,
        title: `${name} added you to ${round}`,
        data: { ...data, start: when },
      });
      await notifyUsers(db, others([existing.created_by]), {
        type: NOTIFICATION_TYPE.InterviewRescheduled,
        title: `${name} updated ${round}`,
        data: { ...data, start: when },
      });
    }

    return Response.json({ schedule: result, issues });
  } catch (e) {
    logApiError("Timeline: save schedule failed", e, { userId: auth.userId });
    return Response.json(
      { error: "Could not save the interview schedule." },
      { status: 500 },
    );
  }
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

  const db = getPool();
  try {
    const schedule = await getCandidateScheduleById(db, scheduleId);
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
      cancelReason: reason,
      canceledBy: auth.userId,
      canceledAt: new Date(),
    });

    const seats = await listScheduleInterviewers(db, String(schedule.id));
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
        type: NOTIFICATION_TYPE.InterviewCanceled,
        title: `${name} canceled ${round}`,
        body: reason,
        data: { scheduleId: String(schedule.id), campaignAppliedId },
      });
    }

    return Response.json({ schedule: result });
  } catch (e) {
    logApiError("Timeline: cancel schedule failed", e, { userId: auth.userId });
    return Response.json({ error: "Could not cancel the interview." }, { status: 500 });
  }
}
