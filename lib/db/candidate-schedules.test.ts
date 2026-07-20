import { describe, expect, it, vi } from "vitest";

import {
  addScheduleInterviewer,
  createCandidateSchedule,
  getCandidateScheduleById,
  listCandidateSchedulesByCampaignApplied,
  listScheduleInterviewers,
  removeScheduleInterviewer,
  updateCandidateSchedule,
} from "@/lib/db/candidate-schedules";

function fakeDb(rows: unknown[] = []) {
  const query = vi.fn().mockResolvedValue({ rows });
  return { query };
}

describe("getCandidateScheduleById", () => {
  it("selects by id with no deleted_at filter (table has none)", async () => {
    const row = { id: "sch-1" };
    const db = fakeDb([row]);

    const result = await getCandidateScheduleById(db, "sch-1");

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      `SELECT * FROM candidate_schedules WHERE id = $1`,
      ["sch-1"],
    );
  });
});

describe("listCandidateSchedulesByCampaignApplied", () => {
  it("orders by scheduled_at descending", async () => {
    const db = fakeDb([]);
    await listCandidateSchedulesByCampaignApplied(db, "app-1");
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("ORDER BY scheduled_at DESC"),
      ["app-1"],
    );
  });
});

describe("createCandidateSchedule", () => {
  it("defaults status to Scheduled", async () => {
    const row = { id: "sch-1" };
    const db = fakeDb([row]);

    await createCandidateSchedule(db, {
      campaignAppliedId: "app-1",
      scheduledAt: "2026-08-01T09:00:00Z",
    });

    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("COALESCE($7, 'Scheduled')");
    expect(values).toEqual([
      "app-1",
      null,
      null,
      "2026-08-01T09:00:00Z",
      null,
      null,
      null,
      null,
      null,
    ]);
  });
});

describe("updateCandidateSchedule", () => {
  it("updates only provided fields", async () => {
    const row = { id: "sch-1", status: "Confirmed" };
    const db = fakeDb([row]);

    const result = await updateCandidateSchedule(db, "sch-1", {
      status: "Confirmed",
    });

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      `UPDATE candidate_schedules
     SET status = $2, updated_at = now()
     WHERE id = $1
     RETURNING *`,
      ["sch-1", "Confirmed"],
    );
  });
});

describe("interviewers join table", () => {
  it("listScheduleInterviewers selects by schedule_id", async () => {
    const db = fakeDb([{ schedule_id: "sch-1", profile_id: "p1" }]);
    const result = await listScheduleInterviewers(db, "sch-1");
    expect(result).toEqual([{ schedule_id: "sch-1", profile_id: "p1" }]);
  });

  it("addScheduleInterviewer inserts with ON CONFLICT DO NOTHING", async () => {
    const db = fakeDb([]);
    await addScheduleInterviewer(db, "sch-1", "p1");
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("ON CONFLICT (schedule_id, profile_id) DO NOTHING"),
      ["sch-1", "p1"],
    );
  });

  it("removeScheduleInterviewer deletes the composite-key row", async () => {
    const db = fakeDb([]);
    await removeScheduleInterviewer(db, "sch-1", "p1");
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM candidate_schedule_interviewers"),
      ["sch-1", "p1"],
    );
  });
});
