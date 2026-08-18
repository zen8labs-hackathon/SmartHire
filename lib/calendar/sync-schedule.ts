import { randomUUID } from "crypto";

import { getCampaignAppliedById } from "@/lib/db/campaign-applied";
import { getCandidateById } from "@/lib/db/candidates";
import {
  listScheduleInterviewers,
  type CandidateScheduleRow,
} from "@/lib/db/candidate-schedules";
import {
  createCalendarSyncPending,
  getCalendarSyncByScheduleId,
  markCalendarSyncCancelled,
  markCalendarSyncFailed,
  markCalendarSyncSuccess,
} from "@/lib/db/candidate-schedule-calendar-syncs";
import type { QueryExecutor } from "@/lib/db/config/client";
import { getEmailSettings } from "@/lib/db/email-settings";
import { getUsersByIds } from "@/lib/db/users";
import { isGraphConfigured } from "@/lib/microsoft/authProvider";
import {
  cancelCalendarEvent,
  createCalendarEvent,
  updateCalendarEvent,
  type GraphCalendarAttendee,
} from "@/lib/microsoft/calendar";
import { logApiError, logInfo } from "@/lib/logger";

const DEFAULT_DURATION_MINUTES = 30;

async function buildScheduleEventContent(
  db: QueryExecutor,
  schedule: CandidateScheduleRow,
): Promise<{ subject: string; bodyHtml: string }> {
  const application = await getCampaignAppliedById(db, schedule.campaign_applied_id);
  const candidate = application
    ? await getCandidateById(db, application.candidate_id)
    : null;
  const candidateName = candidate?.name ?? candidate?.email ?? "Candidate";
  const label = schedule.round_label?.trim() || "Phỏng vấn";

  const bodyParts = [`<p>Ứng viên: ${candidateName}</p>`];
  if (schedule.location) {
    bodyParts.push(`<p>Địa điểm: ${schedule.location}</p>`);
  }

  return {
    subject: `${label} - ${candidateName}`,
    bodyHtml: bodyParts.join(""),
  };
}

/**
 * Creates (or, if a Graph event already exists for this schedule, updates)
 * the calendar event for a `candidate_schedules` row -- called right after
 * create/reschedule, and again whenever the interviewer list changes.
 * Never throws: a calendar-sync failure must not block schedule creation, so
 * every error path just records `status='failed'` on the sync row (visible
 * in the UI) and logs, mirroring how `sendSelfNotificationForTrigger` never
 * blocks account creation.
 */
export async function syncScheduleCalendarEvent(
  db: QueryExecutor,
  schedule: CandidateScheduleRow,
): Promise<void> {
  try {
    const interviewerRows = await listScheduleInterviewers(db, schedule.id);
    const profileIds = interviewerRows.map((r) => r.profile_id);
    const users = profileIds.length ? await getUsersByIds(db, profileIds) : [];
    const usersById = new Map(users.map((u) => [u.id, u]));

    const attendees: GraphCalendarAttendee[] = [];
    const skipped: string[] = [];
    for (const row of interviewerRows) {
      const user = usersById.get(row.profile_id);
      if (!user?.email) {
        skipped.push(row.profile_id);
        continue;
      }
      attendees.push({ email: user.email, name: user.display_name ?? user.email });
    }

    if (interviewerRows.length === 0) {
      // The last interviewer was removed -- cancel whatever Graph event
      // already exists for this schedule so it doesn't sit stale on
      // someone's calendar. If none was ever created (the normal state
      // right after a schedule is created, before any interviewer is
      // assigned), this is a no-op.
      await cancelScheduleCalendarEvent(db, schedule.id);
      return;
    }

    const sync = await createCalendarSyncPending(db, schedule.id);

    if (attendees.length === 0) {
      await markCalendarSyncFailed(
        db,
        sync.id,
        `Không có interviewer nào có email hợp lệ (bỏ qua ${skipped.length}).`,
      );
      return;
    }

    const warning = skipped.length
      ? `Đã bỏ qua ${skipped.length} interviewer không có email hợp lệ.`
      : null;

    const { subject, bodyHtml } = await buildScheduleEventContent(db, schedule);
    const settings = await getEmailSettings(db);
    const organizerMailbox = settings.default_sender;
    const startsAt = schedule.scheduled_at;
    const endsAt = new Date(
      startsAt.getTime() +
        (schedule.duration_minutes ?? DEFAULT_DURATION_MINUTES) * 60_000,
    );

    if (!isGraphConfigured()) {
      logInfo("Simulated calendar sync (Microsoft Graph not configured)", {
        scheduleId: schedule.id,
      });
      await markCalendarSyncSuccess(db, sync.id, {
        graphEventId: `simulated-${randomUUID()}`,
        warning,
      });
      return;
    }

    try {
      if (sync.graph_event_id) {
        await updateCalendarEvent({
          organizerMailbox,
          graphEventId: sync.graph_event_id,
          subject,
          bodyHtml,
          startsAt,
          endsAt,
          location: schedule.location,
          attendees,
        });
        await markCalendarSyncSuccess(db, sync.id, {
          graphEventId: sync.graph_event_id,
          warning,
        });
      } else {
        const { graphEventId } = await createCalendarEvent({
          organizerMailbox,
          subject,
          bodyHtml,
          startsAt,
          endsAt,
          location: schedule.location,
          attendees,
        });
        await markCalendarSyncSuccess(db, sync.id, { graphEventId, warning });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to sync calendar event.";
      await markCalendarSyncFailed(db, sync.id, message);
    }
  } catch (error) {
    logApiError("Calendar sync failed", error, { scheduleId: schedule.id });
  }
}

/** Cancels the Graph event (if any) tied to this schedule and marks the sync row `cancelled`. Never throws. */
export async function cancelScheduleCalendarEvent(
  db: QueryExecutor,
  scheduleId: string,
): Promise<void> {
  try {
    const sync = await getCalendarSyncByScheduleId(db, scheduleId);
    if (!sync || sync.status === "cancelled") return;

    if (
      sync.graph_event_id &&
      !sync.graph_event_id.startsWith("simulated-") &&
      isGraphConfigured()
    ) {
      try {
        const settings = await getEmailSettings(db);
        await cancelCalendarEvent(settings.default_sender, sync.graph_event_id);
      } catch (error) {
        logApiError("Failed to cancel Graph calendar event", error, { scheduleId });
      }
    }

    await markCalendarSyncCancelled(db, scheduleId);
  } catch (error) {
    logApiError("Calendar cancel-sync failed", error, { scheduleId });
  }
}
