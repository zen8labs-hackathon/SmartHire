import { guardLegacyJob } from "@/lib/migration/legacy-flow-guard";
import { validateProbationFailReason } from "@/lib/probation/fail-reason";
import { z } from "zod";

import { requireStaffForRequest } from "@/lib/admin/require-staff-request";
import { canViewSalary } from "@/lib/authz/can";
import { requirePermissionForApplication } from "@/lib/authz/require-permission";
import { redactAdminRowSalary } from "@/lib/authz/redact-salary";
import { requireJobViewAccess } from "@/lib/authz/require-job-view";
import { cancelUpcomingSessions } from "@/lib/calendar/cascade";
import { stageMoveCascadeReason } from "@/lib/candidates/stage-move-cascade";
import { getCampaignAppliedAdminRowById } from "@/lib/db/campaign-applied-list";
import { isAssignedMentor } from "@/lib/authz/probation-mentor";
import {
  getCampaignAppliedById,
  softDeleteAllCampaignAppliedForCandidate,
  softDeleteCampaignApplied,
  updateCampaignApplied,
} from "@/lib/db/campaign-applied";
import { getJobById } from "@/lib/db/jobs";
import { listAllowedProfilesForJob } from "@/lib/db/job-permissions";
import { softDeleteCandidate } from "@/lib/db/candidates";
import { listUpcomingActiveSchedulesForApplications } from "@/lib/db/candidate-schedules";
import { insertStageHistory } from "@/lib/db/candidate-stage-history";
import { getPool, withTransaction } from "@/lib/db/config/client";
import {
  fetchJobPipelineConfig,
  isHiredStageMapping,
  resolveCandidatePipelineIds,
  validateAndBuildPipelineTransition,
} from "@/lib/pipelines/transition-validator";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const patchBodySchema = z.object({
  current_job_stage_mapping_id: z.string().uuid(),
  current_sub_state_id: z.string().uuid(),
  reason: z.string().trim().max(1000).optional(),
  /**
   * Tell interviewers when their upcoming sessions are canceled. Omitted -> true
   * (legacy pipeline page behavior); Position Management 2 always sends it (D4: off by default there).
   */
  notify_interviewers: z.boolean().optional(),
  /** BR-INT-12: on a stage move, cancel the application's upcoming sessions (chosen in the move popup). */
  cancel_upcoming_sessions: z.boolean().optional(),
  /** Hire (D2): agreed start date, only accepted when the target stage is probation-type. */
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "start_date must be YYYY-MM-DD.")
    .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "start_date is not a valid date.")
    .optional(),
  /** Hire: probation Mentor (a person already on the job). Required when entering a probation stage. */
  mentor_profile_id: z.string().uuid().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

/** Full application row (candidate + active CV + pipeline position) for drawer / detail hydration. */
export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: candidateId } = await params;
  if (!candidateId || !UUID_RE.test(candidateId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const db = getPool();
  const row = await getCampaignAppliedAdminRowById(db, candidateId);
  if (!row) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const jobAccess = await requireJobViewAccess(auth.access, row.job_id);
  if (!jobAccess.ok) return jobAccess.response;

  const viewSalary = await canViewSalary(db, auth.access, row.job_id);
  return Response.json({
    candidate: redactAdminRowSalary(row, viewSalary),
    canViewSalary: viewSalary,
  });
}

/**
 * Updates the application's pipeline stage/sub-stage, with the same
 * transition rules as PATCH /api/admin/candidates/pipeline.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: candidateId } = await params;
  if (!candidateId || !UUID_RE.test(candidateId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  let manageAccess = await requirePermissionForApplication(
    auth.access,
    "candidate.manage",
    candidateId,
  );
  // The assigned Mentor may decide probation (sub-state change inside the
  // probation stage only -- enforced below) without candidate.manage.
  let mentorOnly = false;
  if (!manageAccess.ok) {
    const app = await getCampaignAppliedById(getPool(), candidateId);
    if (!app || !isAssignedMentor(app, auth.userId)) return manageAccess.response;
    manageAccess = { ok: true, application: app };
    mentorOnly = true;
  }
  const legacy = await guardLegacyJob(manageAccess.application.job_id);
  if (legacy) return legacy;
  const existing = manageAccess.application;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = patchBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }
  const {
    current_job_stage_mapping_id,
    current_sub_state_id,
    reason,
    notify_interviewers,
    cancel_upcoming_sessions,
    start_date,
    mentor_profile_id,
  } = parsed.data;

  const db = getPool();

  const { stageMappings, subStages } = await fetchJobPipelineConfig(
    db,
    existing.job_id,
  );
  if (stageMappings.length === 0) {
    return Response.json(
      { error: "Could not load pipeline configuration for this job." },
      { status: 400 },
    );
  }

  const job = existing.job_id ? await getJobById(db, existing.job_id) : null;
  const result = validateAndBuildPipelineTransition(
    existing,
    {
      toStageMappingId: current_job_stage_mapping_id,
      toSubStateId: current_sub_state_id,
    },
    stageMappings,
    subStages,
    { legacyFlow: !job?.pipeline_id },
  );
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  if (mentorOnly) {
    const currentMapping = stageMappings.find(
      (sm) => sm.id === existing.current_job_stage_mapping_id,
    );
    if (
      !isHiredStageMapping(currentMapping) ||
      result.patch.currentJobStageMappingId !== existing.current_job_stage_mapping_id ||
      mentor_profile_id !== undefined ||
      start_date !== undefined
    ) {
      return Response.json(
        { error: "A Mentor can only record the probation decision (Pass / Not pass)." },
        { status: 403 },
      );
    }
  }

  if (start_date !== undefined) {
    const targetMapping = stageMappings.find(
      (sm) => sm.id === result.patch.currentJobStageMappingId,
    );
    if (!isHiredStageMapping(targetMapping)) {
      return Response.json(
        { error: "start_date can only be set when moving to a probation stage." },
        { status: 400 },
      );
    }
  }

  const stageChanged =
    existing.current_job_stage_mapping_id !==
    result.patch.currentJobStageMappingId;

  // Mentor: required when entering a probation stage, rejected otherwise, and
  // must already be on the job (Position Management access list).
  const targetIsProbation = isHiredStageMapping(
    stageMappings.find((sm) => sm.id === result.patch.currentJobStageMappingId),
  );
  const enteringProbation =
    targetIsProbation &&
    !isHiredStageMapping(
      stageMappings.find((sm) => sm.id === existing.current_job_stage_mapping_id),
    );
  if (mentor_profile_id !== undefined && !targetIsProbation) {
    return Response.json(
      { error: "mentor_profile_id can only be set when moving to a probation stage." },
      { status: 400 },
    );
  }
  if (enteringProbation && !mentor_profile_id) {
    return Response.json(
      { error: "A Mentor is required to move a candidate to probation." },
      { status: 400 },
    );
  }
  if (mentor_profile_id) {
    const members = existing.job_id
      ? await listAllowedProfilesForJob(db, existing.job_id)
      : [];
    if (!members.some((m) => m.profile_id === mentor_profile_id)) {
      return Response.json(
        { error: "The Mentor must be someone already added to this position." },
        { status: 422 },
      );
    }
  }
  const subChanged =
    existing.current_sub_state_id !== result.patch.currentSubStateId;
  const failCheck = validateProbationFailReason({
    targetIsProbation,
    subChanged,
    targetSub: subStages.find((s) => s.id === result.patch.currentSubStateId),
    reason,
  });
  if (!failCheck.ok) {
    return Response.json({ error: failCheck.error }, { status: 400 });
  }

  // Never-moved applications have NULL stage ids; log the resolved position so
  // the history (and reject undo) knows where the candidate really was.
  const from = resolveCandidatePipelineIds(existing, stageMappings, subStages);

  await withTransaction(async (tx) => {
    await updateCampaignApplied(tx, candidateId, {
      currentJobStageMappingId: result.patch.currentJobStageMappingId,
      currentSubStateId: result.patch.currentSubStateId,
      hiredAt: result.patch.hiredAt,
      startDate: start_date,
      mentorProfileId: mentor_profile_id,
    });
    if (stageChanged || subChanged) {
      await insertStageHistory(tx, {
        campaignAppliedId: candidateId,
        fromStageMappingId: from.stageMappingId ?? existing.current_job_stage_mapping_id,
        toStageMappingId: result.patch.currentJobStageMappingId,
        fromSubStateId: from.subStateId ?? existing.current_sub_state_id,
        toSubStateId: result.patch.currentSubStateId,
        reason: reason ?? null,
        byUserId: auth.userId,
      });
    }
    if (stageChanged) {
      await tx.query(
        `UPDATE campaign_applied SET entered_stage_at = now() WHERE id = $1`,
        [candidateId],
      );
    }
  });

  // Rejecting or withdrawing the candidate cancels their upcoming interviews.
  const target = subStages.find((s) => s.id === result.patch.currentSubStateId);
  const cascadeReason = stageMoveCascadeReason({
    stageChanged,
    subChanged,
    target,
    cancelUpcomingSessions: cancel_upcoming_sessions,
  });
  if (cascadeReason) {
    try {
      const upcoming = await listUpcomingActiveSchedulesForApplications(db, [candidateId]);
      await cancelUpcomingSessions(db, upcoming, {
        reason: cascadeReason,
        actorId: auth.userId,
        notify: notify_interviewers ?? true,
      });
    } catch (e) {
      console.error("[candidates/patch] interview cascade failed", candidateId, e);
    }
  }

  const row = await getCampaignAppliedAdminRowById(db, candidateId);
  if (!row) {
    return Response.json(
      { error: "Could not load updated candidate." },
      { status: 500 },
    );
  }

  const viewSalary = await canViewSalary(db, auth.access, row.job_id);
  return Response.json({ candidate: redactAdminRowSalary(row, viewSalary) });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await requireStaffForRequest(request);
  if (!auth.ok) return auth.response;

  const { id: candidateId } = await params;
  if (!candidateId || !UUID_RE.test(candidateId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const searchParams = new URL(request.url).searchParams;
  const deletePersonScope = searchParams.get("scope") === "person";
  // Legacy page sends no flag and keeps notifying; PM2 sends notify=0|1 (D4).
  const notifyInterviewers = searchParams.get("notify") !== "0";

  if (deletePersonScope && !auth.access.isHr) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const manageAccess = await requirePermissionForApplication(
    auth.access,
    "candidate.manage",
    candidateId,
  );
  if (!manageAccess.ok) return manageAccess.response;
  const legacy = await guardLegacyJob(manageAccess.application.job_id);
  if (legacy) return legacy;

  const deleted = await withTransaction(async (tx) => {
    const row = await softDeleteCampaignApplied(tx, candidateId);
    if (!row) return null;

    if (deletePersonScope) {
      await softDeleteAllCampaignAppliedForCandidate(tx, row.candidate_id);
      await softDeleteCandidate(tx, row.candidate_id);
      return row;
    }

    const { rows: remaining } = await tx.query<{ count: string }>(
      `SELECT count(*)::int AS count FROM campaign_applied WHERE candidate_id = $1 AND deleted_at IS NULL`,
      [row.candidate_id],
    );
    if (Number(remaining[0]?.count ?? 0) === 0) {
      await softDeleteCandidate(tx, row.candidate_id);
    }
    return row;
  });
  if (!deleted) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  // Deleting the application (or the whole person) cancels upcoming interviews.
  try {
    const db = getPool();
    let applicationIds = [candidateId];
    if (deletePersonScope) {
      const { rows } = await db.query<{ id: string }>(
        `SELECT id FROM campaign_applied WHERE candidate_id = $1`,
        [deleted.candidate_id],
      );
      applicationIds = rows.map((r) => r.id);
    }
    const upcoming = await listUpcomingActiveSchedulesForApplications(db, applicationIds);
    await cancelUpcomingSessions(db, upcoming, {
      reason: "The candidate was removed.",
      actorId: auth.userId,
      notify: notifyInterviewers,
    });
  } catch (e) {
    console.error("[candidates/delete] interview cascade failed", candidateId, e);
  }

  return new Response(null, { status: 204 });
}
