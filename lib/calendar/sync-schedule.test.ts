import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/campaign-applied", () => ({
  getCampaignAppliedById: vi.fn(),
}));
vi.mock("@/lib/db/candidates", () => ({
  getCandidateById: vi.fn(),
}));
vi.mock("@/lib/db/candidate-schedules", () => ({
  listScheduleInterviewers: vi.fn(),
}));
vi.mock("@/lib/db/candidate-schedule-calendar-syncs", () => ({
  createCalendarSyncPending: vi.fn(),
  getCalendarSyncByScheduleId: vi.fn(),
  markCalendarSyncCancelled: vi.fn(),
  markCalendarSyncFailed: vi.fn(),
  markCalendarSyncSuccess: vi.fn(),
}));
vi.mock("@/lib/db/email-settings", () => ({
  getEmailSettings: vi.fn(),
}));
vi.mock("@/lib/db/users", () => ({
  getUsersByIds: vi.fn(),
}));
vi.mock("@/lib/microsoft/authProvider", () => ({
  isGraphConfigured: vi.fn(),
}));
vi.mock("@/lib/microsoft/calendar", () => ({
  cancelCalendarEvent: vi.fn(),
  createCalendarEvent: vi.fn(),
  updateCalendarEvent: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logApiError: vi.fn(),
  logInfo: vi.fn(),
}));

import { getCampaignAppliedById } from "@/lib/db/campaign-applied";
import { getCandidateById } from "@/lib/db/candidates";
import { listScheduleInterviewers } from "@/lib/db/candidate-schedules";
import {
  createCalendarSyncPending,
  getCalendarSyncByScheduleId,
  markCalendarSyncCancelled,
  markCalendarSyncFailed,
  markCalendarSyncSuccess,
} from "@/lib/db/candidate-schedule-calendar-syncs";
import { getEmailSettings } from "@/lib/db/email-settings";
import { getUsersByIds } from "@/lib/db/users";
import { isGraphConfigured } from "@/lib/microsoft/authProvider";
import { cancelCalendarEvent, createCalendarEvent, updateCalendarEvent } from "@/lib/microsoft/calendar";
import { cancelScheduleCalendarEvent, syncScheduleCalendarEvent } from "@/lib/calendar/sync-schedule";

const db = {} as never;

const schedule = {
  id: "sch-1",
  campaign_applied_id: "app-1",
  job_stage_mapping_id: null,
  round_label: "Technical round",
  scheduled_at: new Date("2026-08-20T02:00:00.000Z"),
  duration_minutes: 45,
  location: "Room 3",
  status: "Scheduled",
  rescheduled_from_id: null,
  created_by: null,
  created_at: new Date(),
  updated_at: new Date(),
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCampaignAppliedById).mockResolvedValue({ candidate_id: "cand-1" } as never);
  vi.mocked(getCandidateById).mockResolvedValue({ name: "Alice" } as never);
  vi.mocked(getEmailSettings).mockResolvedValue({ default_sender: "no-reply@smart-hire.test" } as never);
});

describe("syncScheduleCalendarEvent", () => {
  it("no-ops (no sync row created) when no interviewer is assigned yet", async () => {
    vi.mocked(listScheduleInterviewers).mockResolvedValue([]);
    vi.mocked(getCalendarSyncByScheduleId).mockResolvedValue(null);

    await syncScheduleCalendarEvent(db, schedule);

    expect(createCalendarSyncPending).not.toHaveBeenCalled();
    expect(markCalendarSyncFailed).not.toHaveBeenCalled();
  });

  it("marks the sync row failed when every assigned interviewer lacks an email", async () => {
    vi.mocked(listScheduleInterviewers).mockResolvedValue([
      { schedule_id: "sch-1", profile_id: "p1", rsvp_status: "none", created_at: new Date() },
    ]);
    vi.mocked(getUsersByIds).mockResolvedValue([{ id: "p1", email: "" } as never]);
    vi.mocked(createCalendarSyncPending).mockResolvedValue({ id: "sync-1", graph_event_id: null } as never);

    await syncScheduleCalendarEvent(db, schedule);

    expect(markCalendarSyncFailed).toHaveBeenCalledWith(
      db,
      "sync-1",
      expect.stringContaining("Không có interviewer"),
    );
  });

  it("simulates a successful sync when Microsoft Graph isn't configured", async () => {
    vi.mocked(listScheduleInterviewers).mockResolvedValue([
      { schedule_id: "sch-1", profile_id: "p1", rsvp_status: "none", created_at: new Date() },
    ]);
    vi.mocked(getUsersByIds).mockResolvedValue([
      { id: "p1", email: "interviewer@smart-hire.test", display_name: "Bob" } as never,
    ]);
    vi.mocked(createCalendarSyncPending).mockResolvedValue({ id: "sync-1", graph_event_id: null } as never);
    vi.mocked(isGraphConfigured).mockReturnValue(false);

    await syncScheduleCalendarEvent(db, schedule);

    expect(createCalendarEvent).not.toHaveBeenCalled();
    expect(markCalendarSyncSuccess).toHaveBeenCalledWith(
      db,
      "sync-1",
      expect.objectContaining({ graphEventId: expect.stringMatching(/^simulated-/) }),
    );
  });

  it("creates a Graph event when none exists yet for this schedule", async () => {
    vi.mocked(listScheduleInterviewers).mockResolvedValue([
      { schedule_id: "sch-1", profile_id: "p1", rsvp_status: "none", created_at: new Date() },
    ]);
    vi.mocked(getUsersByIds).mockResolvedValue([
      { id: "p1", email: "interviewer@smart-hire.test", display_name: "Bob" } as never,
    ]);
    vi.mocked(createCalendarSyncPending).mockResolvedValue({ id: "sync-1", graph_event_id: null } as never);
    vi.mocked(isGraphConfigured).mockReturnValue(true);
    vi.mocked(createCalendarEvent).mockResolvedValue({ graphEventId: "evt-1" });

    await syncScheduleCalendarEvent(db, schedule);

    expect(createCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({ organizerMailbox: "no-reply@smart-hire.test" }),
    );
    expect(updateCalendarEvent).not.toHaveBeenCalled();
    expect(markCalendarSyncSuccess).toHaveBeenCalledWith(
      db,
      "sync-1",
      expect.objectContaining({ graphEventId: "evt-1" }),
    );
  });

  it("updates the existing Graph event instead of creating a new one", async () => {
    vi.mocked(listScheduleInterviewers).mockResolvedValue([
      { schedule_id: "sch-1", profile_id: "p1", rsvp_status: "none", created_at: new Date() },
    ]);
    vi.mocked(getUsersByIds).mockResolvedValue([
      { id: "p1", email: "interviewer@smart-hire.test", display_name: "Bob" } as never,
    ]);
    vi.mocked(createCalendarSyncPending).mockResolvedValue({ id: "sync-1", graph_event_id: "evt-existing" } as never);
    vi.mocked(isGraphConfigured).mockReturnValue(true);

    await syncScheduleCalendarEvent(db, schedule);

    expect(updateCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({ graphEventId: "evt-existing" }),
    );
    expect(createCalendarEvent).not.toHaveBeenCalled();
    expect(markCalendarSyncSuccess).toHaveBeenCalledWith(
      db,
      "sync-1",
      expect.objectContaining({ graphEventId: "evt-existing" }),
    );
  });

  it("marks the sync row failed (without dropping the existing graph_event_id) when the Graph call throws", async () => {
    vi.mocked(listScheduleInterviewers).mockResolvedValue([
      { schedule_id: "sch-1", profile_id: "p1", rsvp_status: "none", created_at: new Date() },
    ]);
    vi.mocked(getUsersByIds).mockResolvedValue([
      { id: "p1", email: "interviewer@smart-hire.test", display_name: "Bob" } as never,
    ]);
    vi.mocked(createCalendarSyncPending).mockResolvedValue({ id: "sync-1", graph_event_id: null } as never);
    vi.mocked(isGraphConfigured).mockReturnValue(true);
    vi.mocked(createCalendarEvent).mockRejectedValue(new Error("Graph is down"));

    await syncScheduleCalendarEvent(db, schedule);

    expect(markCalendarSyncFailed).toHaveBeenCalledWith(db, "sync-1", "Graph is down");
  });
});

describe("cancelScheduleCalendarEvent", () => {
  it("no-ops when there's no sync row", async () => {
    vi.mocked(getCalendarSyncByScheduleId).mockResolvedValue(null);

    await cancelScheduleCalendarEvent(db, "sch-1");

    expect(cancelCalendarEvent).not.toHaveBeenCalled();
    expect(markCalendarSyncCancelled).not.toHaveBeenCalled();
  });

  it("cancels the Graph event and marks the row cancelled", async () => {
    vi.mocked(getCalendarSyncByScheduleId).mockResolvedValue({
      id: "sync-1",
      schedule_id: "sch-1",
      graph_event_id: "evt-1",
      status: "synced",
    } as never);
    vi.mocked(isGraphConfigured).mockReturnValue(true);

    await cancelScheduleCalendarEvent(db, "sch-1");

    expect(cancelCalendarEvent).toHaveBeenCalledWith("no-reply@smart-hire.test", "evt-1");
    expect(markCalendarSyncCancelled).toHaveBeenCalledWith(db, "sch-1");
  });

  it("skips the Graph call for a simulated event id, but still marks cancelled", async () => {
    vi.mocked(getCalendarSyncByScheduleId).mockResolvedValue({
      id: "sync-1",
      schedule_id: "sch-1",
      graph_event_id: "simulated-abc",
      status: "synced",
    } as never);

    await cancelScheduleCalendarEvent(db, "sch-1");

    expect(cancelCalendarEvent).not.toHaveBeenCalled();
    expect(markCalendarSyncCancelled).toHaveBeenCalledWith(db, "sch-1");
  });
});
