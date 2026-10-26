import type { StaffProfileAccess } from "@/lib/admin/profile-access";
import { appUrl, ownerDisplayName } from "@/lib/calendar/busy";
import { checkConflicts, hasBlocking } from "@/lib/calendar/conflicts";
import {
  calendarHref,
  fmtWhen,
  notifyUsers,
  sendEmail,
} from "@/lib/calendar/notify";
import { canManageInterviews, canReschedule } from "@/lib/calendar/authz";
import {
  DEFAULT_DURATION_MIN,
  displayName,
  loadConflictContext,
} from "@/lib/calendar/server";
import { roundDetailsError } from "@/lib/calendar/validation";
import { getCampaignAppliedById } from "@/lib/db/campaign-applied";
import { getCandidateById } from "@/lib/db/candidates";
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
  getPipelineStageByIdIncludingDeleted,
} from "@/lib/db/pipeline-stages";
import { getUsersByIds } from "@/lib/db/users";
import { logApiError } from "@/lib/logger";
import { isSchedulingEnabled } from "@/lib/pipelines/transition-validator";
import { NOTIFICATION_TYPE } from "@/lib/redis/channels";

/**
 * Interview rounds of one application (used by /api/admin/candidates/[id]/timeline).
 * Each function returns the HTTP status + JSON body so the route stays a thin
 * auth/parse/serialize layer and the contract is unchanged.
 */
export type RoundResult = { status: number; body: unknown };

const json = (body: unknown, status = 200): RoundResult => ({ status, body });
const err = (error: string, status: number): RoundResult => json({ error }, status);

export type SaveRoundInput = {
  scheduledAt: string;
  roundLabel?: string;
  durationMinutes?: number;
  location?: string;
  scheduleId?: string;
  interviewerIds?: string[];
  mode?: "online" | "office";
  meetingLink?: string;
  note?: string;
  reason?: string;
  acknowledgeSoft?: boolean;
  strict?: boolean;
};

type Actor = { userId: string; access: StaffProfileAccess };

/** Schedule history for the "past rounds" list, most recent first. */
export async function listRoundsForApplication(
  actor: Actor,
  campaignAppliedId: string,
): Promise<RoundResult> {
  const auth = actor;
  const db = getPool();
  const rows = await listCandidateSchedulesByCampaignApplied(
    db,
    campaignAppliedId,
  );
  const seatsByRow = await Promise.all(
    rows.map((r) => listScheduleInterviewers(db, String(r.id))),
  );
  const userIds = [
    ...new Set([
      ...seatsByRow.flat().map((x) => x.profile_id),
      ...rows.map((r) => r.created_by).filter((x): x is string => !!x),
    ]),
  ];
  const users = userIds.length ? await getUsersByIds(db, userIds) : [];
  const nameById = new Map(users.map((u) => [u.id, displayName(u)]));
  const schedules = rows.map((r, i) => {
    const seats = seatsByRow[i];
    const interviewerIds = seats.map((x) => x.profile_id);
    return {
      ...r,
      interviewers: interviewerIds,
      seats: seats.map((x) => ({
        id: x.profile_id,
        name: nameById.get(x.profile_id) ?? "Someone",
        declinedAt: x.declined_at,
        declineReason: x.decline_reason,
        submitted: x.evaluation_submitted_at !== null,
      })),
      organizerName: r.created_by ? (nameById.get(r.created_by) ?? null) : null,
      canEdit: canReschedule(auth.access, {
        createdBy: r.created_by,
        interviewerIds,
      }),
    };
  });
  return json({ schedules });
}

/** Creates a new round or reschedules/updates the round named by `body.scheduleId`. */
export async function saveRound(
  actor: Actor,
  campaignAppliedId: string,
  body: SaveRoundInput,
): Promise<RoundResult> {
  const auth = actor;
  // BR-INT-01: only HR, Admin and Recruiters create sessions. BR-07-01 also lets
  // the organizer (e.g. a Chapter Head) edit their own session -- checked below.
  const isManager = canManageInterviews(auth.access);
  const { scheduledAt, scheduleId } = body;
  const reason = body.reason?.trim() || undefined;
  if (!isManager && !scheduleId) {
    return err("Only HR or a recruiter can schedule interviews.", 403);
  }

  const db = getPool();
  try {
    const campaignApplied = await getCampaignAppliedById(db, campaignAppliedId);
    if (!campaignApplied) {
      return err("Application not found.", 404);
    }

    let existing: CandidateScheduleRow | null = null;
    let existingSeatIds: string[] = [];
    let jobStageMappingId: string | null;

    if (scheduleId) {
      // "Edit": reschedule/update the exact round the caller named, on
      // whatever stage it originally belonged to.
      existing = await getCandidateScheduleById(db, scheduleId);
      if (!existing || existing.campaign_applied_id !== campaignAppliedId) {
        return err("Schedule not found.", 404);
      }
      if (existing.status !== "Scheduled" && existing.status !== "Confirmed") {
        return err("Only an active round can be edited.", 400);
      }
      existingSeatIds = (await listScheduleInterviewers(db, existing.id)).map(
        (s) => s.profile_id,
      );
      if (!isManager) {
        const own = canReschedule(auth.access, {
          createdBy: existing.created_by,
          interviewerIds: existingSeatIds,
        });
        if (!own) {
          return err("You can only reschedule interviews you organized.", 403);
        }
        if (existing.scheduled_at.getTime() <= Date.now()) {
          return err("Only an upcoming interview can be rescheduled.", 400);
        }
      }
      jobStageMappingId = existing.job_stage_mapping_id;
    } else {
      // "Add new": always an independent round on the current stage.
      if (!campaignApplied.current_job_stage_mapping_id) {
        return err("Application has no pipeline stage assigned.", 400);
      }
      const stageMapping = await getJobStageMappingById(
        db,
        campaignApplied.current_job_stage_mapping_id,
      );
      const stage = stageMapping
        ? await getPipelineStageByIdIncludingDeleted(db, stageMapping.pipeline_stage_id)
        : null;
      if (!isSchedulingEnabled(stageMapping, stage)) {
        return err("Scheduling is not enabled for the application's current stage.", 400);
      }
      jobStageMappingId = campaignApplied.current_job_stage_mapping_id;
    }

    const start = new Date(scheduledAt);
    const timeChanged =
      existing !== null &&
      existing.scheduled_at.toISOString() !== start.toISOString();
    if (timeChanged && !reason) {
      return err("Give a reason for rescheduling.", 400);
    }

    const detailsError =
      body.strict !== true
        ? null
        : roundDetailsError({
            isNew: existing === null,
            interviewerIds: body.interviewerIds,
            mode: body.mode ?? existing?.mode,
            location: body.location ?? existing?.location,
          });
    if (detailsError) {
      return err(detailsError, 400);
    }

    const interviewerIds = body.interviewerIds
      ? [...new Set(body.interviewerIds)]
      : existingSeatIds;
    const durationMin =
      body.durationMinutes ??
      existing?.duration_minutes ??
      DEFAULT_DURATION_MIN;

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
      return json({ issues }, 409);
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
        await updateCandidateSchedule(tx, existing.id, {
          status: "Rescheduled",
        });
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
    const when = start.toISOString();
    const data = {
      scheduleId: String(result.id),
      campaignAppliedId,
      href: calendarHref(String(result.id), when),
    };
    const others = (ids: (string | null)[]) =>
      ids.filter((x): x is string => !!x && x !== auth.userId);

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
          data: {
            ...data,
            start: when,
            previousScheduleId: String(existing.id),
          },
        },
      );
      // BR-INT-05: only interviewers are emailed; the candidate is contacted
      // outside SmartHire.
      if (body.strict === true) {
        const [candidate, seats] = await Promise.all([
          getCandidateById(db, campaignApplied.candidate_id),
          getUsersByIds(db, interviewerIds),
        ]);
        const lines = [
          `${round} has moved to a new time.`,
          "",
          `Previous: ${fmtWhen(existing.scheduled_at)}`,
          `New: ${fmtWhen(start)}`,
          ...(result.meeting_link
            ? [`Meeting link: ${result.meeting_link}`]
            : []),
          ...(result.location ? [`Location: ${result.location}`] : []),
        ];
        await sendEmail({
          to: seats.map((u) => u.email),
          subject: `${round}${candidate?.name ? ` with ${candidate.name}` : ""} rescheduled`,
          text: [
            ...lines,
            ...(reason ? [`Reason: ${reason}`] : []),
            "",
            `Open in SmartHire: ${appUrl(data.href)}`,
          ].join("\n"),
        });
      }
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

    return json({ schedule: result, issues });
  } catch (e) {
    logApiError("Timeline: save schedule failed", e, { userId: auth.userId });
    return err("Could not save the interview schedule.", 500);
  }
}

/** Cancels an active round (status -> "Canceled") and notifies the people involved. */
export async function cancelRound(
  actor: Actor,
  campaignAppliedId: string,
  scheduleId: string,
  reason: string,
): Promise<RoundResult> {
  const auth = actor;
  // BR-INT-01: only HR, Admin and Recruiters manage interview sessions.
  if (!canManageInterviews(auth.access)) {
    return err("Only HR or a recruiter can manage interview schedules.", 403);
  }

  const db = getPool();
  try {
    const schedule = await getCandidateScheduleById(db, scheduleId);
    if (!schedule || schedule.campaign_applied_id !== campaignAppliedId) {
      return err("Schedule not found.", 404);
    }
    if (schedule.status !== "Scheduled" && schedule.status !== "Confirmed") {
      return err("Only the active schedule can be canceled.", 400);
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
        data: {
          scheduleId: String(schedule.id),
          campaignAppliedId,
          href: calendarHref(String(schedule.id), schedule.scheduled_at),
        },
      });
    }

    return json({ schedule: result });
  } catch (e) {
    logApiError("Timeline: cancel schedule failed", e, { userId: auth.userId });
    return err("Could not cancel the interview.", 500);
  }
}
