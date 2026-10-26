import { describe, expect, it, vi } from "vitest";

import {
  addScheduleInterviewer,
  countUpcomingActiveSchedulesForStage,
  createCandidateSchedule,
  declineScheduleInterviewer,
  getCandidateScheduleById,
  listCandidateSchedulesByCampaignApplied,
  listInterviewersForSchedules,
  listScheduleInterviewers,
  listSchedulesInRange,
  markEvaluationSubmitted,
  listOverdueEvaluationSeats,
  markOverdueNotified,
  OVERDUE_REMINDER_CUTOFF,
  removeScheduleInterviewer,
  setNoInterviewerFlag,
  updateCandidateSchedule,
  upcomingInterviewsBlockMessage,
  withdrawScheduleInterviewerDecline,
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
    expect(sql).toContain("COALESCE($10, 'online')");
    expect(sql).toContain("COALESCE($14, false)");
    expect(sql).toContain(
      "$4::timestamptz + make_interval(mins => COALESCE($5::int, 60)) + interval '24 hours'",
    );
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
      null,
      null,
      null,
      null,
      null,
    ]);
  });
});

describe("listSchedulesInRange", () => {
  it("returns [] without querying for an empty people filter", async () => {
    const db = fakeDb([]);
    expect(await listSchedulesInRange(db, "a", "b", [])).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("filters by active statuses without people", async () => {
    const db = fakeDb([]);
    await listSchedulesInRange(db, "a", "b");
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("cs.status = ANY($3::text[])");
    expect(sql).not.toContain("$4");
    expect(values).toHaveLength(3);
    expect(values.slice(0, 2)).toEqual(["a", "b"]);
  });

  it("adds the interviewer filter when people are given", async () => {
    const db = fakeDb([]);
    await listSchedulesInRange(db, "a", "b", ["p1"]);
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain("csi.profile_id = ANY($4::uuid[])");
    expect(values[3]).toEqual(["p1"]);
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

  it("recomputes evaluation_due_at from the new start", async () => {
    const db = fakeDb([{ id: "sch-1" }]);
    await updateCandidateSchedule(db, "sch-1", { scheduledAt: "X" });
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain(
      "scheduled_at = $2, evaluation_due_at = $3::timestamptz + make_interval(mins => COALESCE(duration_minutes, 60)) + interval '24 hours'",
    );
    expect(values).toEqual(["sch-1", "X", "X", null]);
  });
});

describe("interviewer decline and evaluation", () => {
  it("listInterviewersForSchedules skips the query for no ids", async () => {
    const db = fakeDb([]);
    expect(await listInterviewersForSchedules(db, [])).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("listInterviewersForSchedules filters by bigint ids", async () => {
    const db = fakeDb([]);
    await listInterviewersForSchedules(db, ["1", "2"]);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("schedule_id = ANY($1::bigint[])"),
      [["1", "2"]],
    );
  });

  it("declineScheduleInterviewer only declines a seat once", async () => {
    const db = fakeDb([]);
    const result = await declineScheduleInterviewer(db, "1", "p1", "sick");
    expect(result).toBeNull();
    const sql = vi.mocked(db.query).mock.calls[0][0] as string;
    expect(sql).toContain("SET declined_at = now(), decline_reason = $3");
    expect(sql).toContain("AND declined_at IS NULL");
    expect(vi.mocked(db.query).mock.calls[0][1]).toEqual(["1", "p1", "sick"]);
  });

  it("withdrawScheduleInterviewerDecline skips seats with a replacement", async () => {
    const db = fakeDb([]);
    await withdrawScheduleInterviewerDecline(db, "1", "p1");
    const sql = vi.mocked(db.query).mock.calls[0][0] as string;
    expect(sql).toContain("SET declined_at = NULL, decline_reason = NULL");
    expect(sql).toContain("me.declined_at IS NOT NULL");
    expect(sql).toContain("other.created_at > me.declined_at");
    expect(vi.mocked(db.query).mock.calls[0][1]).toEqual(["1", "p1"]);
  });

  it("setNoInterviewerFlag sets the flag", async () => {
    const db = fakeDb([]);
    await setNoInterviewerFlag(db, "1", true);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("no_interviewer_flag = $2"),
      ["1", true],
    );
  });

  it("markEvaluationSubmitted keeps the first submit time", async () => {
    const db = fakeDb([]);
    await markEvaluationSubmitted(db, "1", "p1");
    expect(db.query.mock.calls[0][0]).toContain(
      "COALESCE(evaluation_submitted_at, now())",
    );
  });

  it("markOverdueNotified reports whether it claimed the reminder", async () => {
    const claimed = fakeDb([{ schedule_id: "1" }]);
    expect(await markOverdueNotified(claimed, "1", "p1")).toBe(true);
    expect(claimed.query.mock.calls[0][0]).toContain(
      "overdue_notified_at IS NULL",
    );

    const already = fakeDb([]);
    expect(await markOverdueNotified(already, "1", "p1")).toBe(false);
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

describe("countUpcomingActiveSchedulesForStage (BR-INT-13)", () => {
  const now = new Date("2026-10-22T00:00:00Z");

  it("counts active future sessions by pipeline stage id", async () => {
    const db = fakeDb([{ n: "3" }]);
    await expect(countUpcomingActiveSchedulesForStage(db, { id: "st-1" }, now)).resolves.toBe(3);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("ps.id = $1::uuid");
    expect(sql).toContain("COALESCE(cs.job_stage_mapping_id, ca.current_job_stage_mapping_id)");
    expect(params).toEqual(["st-1", ["Scheduled", "Confirmed"], now]);
  });

  it("counts by library stage code, ignoring deleted stages", async () => {
    const db = fakeDb([]);
    await expect(countUpcomingActiveSchedulesForStage(db, { code: "iv" }, now)).resolves.toBe(0);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("ps.code = $1 AND ps.deleted_at IS NULL");
    expect(params[0]).toBe("iv");
  });

  it("builds the block message", () => {
    expect(upcomingInterviewsBlockMessage(1)).toBe("1 interview is still upcoming in this stage. Cancel or finish them first.");
    expect(upcomingInterviewsBlockMessage(2)).toBe("2 interviews are still upcoming in this stage. Cancel or finish them first.");
  });
});

describe("listOverdueEvaluationSeats", () => {
  it("only selects deadlines on/after the cutoff", async () => {
    const db = fakeDb([]);
    const cutoff = new Date("2026-11-01T00:00:00Z");
    const now = new Date("2026-11-05T00:00:00Z");
    await listOverdueEvaluationSeats(db, cutoff, now, 10);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("cs.evaluation_due_at >= $4");
    expect(params).toEqual([now, ["Scheduled", "Confirmed", "Completed"], 10, cutoff]);
  });
});

describe("OVERDUE_REMINDER_CUTOFF", () => {
  it("is a valid fixed instant", () => {
    expect(OVERDUE_REMINDER_CUTOFF.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });
});
