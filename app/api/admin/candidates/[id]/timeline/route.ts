import { z } from "zod";

import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { requireJobViewForApplication } from "@/lib/authz/require-application-job-view";
import { getCampaignAppliedById } from "@/lib/db/campaign-applied";
import {
  createCandidateSchedule,
  listCandidateSchedulesByCampaignApplied,
  updateCandidateSchedule,
  type CandidateScheduleRow,
} from "@/lib/db/candidate-schedules";
import { getPool, withTransaction } from "@/lib/db/config/client";
import { getJobStageMappingById, getPipelineStageById } from "@/lib/db/pipeline-stages";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isoDateTime = z.string().refine(
  (s) => s.length > 0 && Number.isFinite(Date.parse(s)),
  "Invalid ISO datetime",
);

const bodySchema = z
  .object({
    scheduledAt: isoDateTime,
    roundLabel: z.string().max(200).optional(),
    durationMinutes: z.number().int().positive().optional(),
    location: z.string().max(500).optional(),
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
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: campaignAppliedId } = await params;
  if (!campaignAppliedId || !UUID_RE.test(campaignAppliedId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

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
  const { scheduledAt, roundLabel, durationMinutes, location } = parsed.data;

  const db = getPool();

  const campaignApplied = await getCampaignAppliedById(db, campaignAppliedId);
  if (!campaignApplied) {
    return Response.json({ error: "Application not found." }, { status: 404 });
  }

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
  const stage = stageMapping ? await getPipelineStageById(db, stageMapping.pipeline_stage_id) : null;
  if (stage?.code !== "interview") {
    return Response.json(
      { error: "Interview time can only be set while the application is in the Interview stage." },
      { status: 400 },
    );
  }

  const schedules = await listCandidateSchedulesByCampaignApplied(db, campaignAppliedId);
  const active = schedules.find((s) => s.status === "Scheduled" || s.status === "Confirmed");

  const scheduledAtChanged =
    !active || active.scheduled_at.toISOString() !== new Date(scheduledAt).toISOString();

  let result: CandidateScheduleRow;
  try {
    if (!active) {
      result = await createCandidateSchedule(db, {
        campaignAppliedId,
        jobStageMappingId: campaignApplied.current_job_stage_mapping_id,
        roundLabel,
        scheduledAt,
        durationMinutes,
        location,
        createdBy: auth.userId,
      });
    } else if (!scheduledAtChanged) {
      result = await updateCandidateSchedule(db, active.id, { roundLabel, durationMinutes, location }) ?? active;
    } else {
      result = await withTransaction(async (tx) => {
        await updateCandidateSchedule(tx, active.id, { status: "Rescheduled" });
        return createCandidateSchedule(tx, {
          campaignAppliedId,
          jobStageMappingId: campaignApplied.current_job_stage_mapping_id,
          roundLabel,
          scheduledAt,
          durationMinutes,
          location,
          rescheduledFromId: active.id,
          createdBy: auth.userId,
        });
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to save interview schedule.";
    return Response.json({ error: msg }, { status: 500 });
  }

  return Response.json({ schedule: result });
}
