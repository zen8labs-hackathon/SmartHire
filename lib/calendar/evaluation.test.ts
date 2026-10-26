import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/candidate-schedules", () => ({
  findOpenEvaluationSeatForApplication: vi.fn(),
  markEvaluationSubmitted: vi.fn(),
  countPendingEvaluationSeats: vi.fn(),
  updateCandidateSchedule: vi.fn(),
}));

import * as cs from "@/lib/db/candidate-schedules";
import { recordEvaluationSubmission } from "@/lib/calendar/evaluation";

const db = {} as never;
const m = vi.mocked(cs);

describe("recordEvaluationSubmission (BR-INT-07/11)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is a no-op when the user has no open seat", async () => {
    m.findOpenEvaluationSeatForApplication.mockResolvedValue(null as never);
    await expect(recordEvaluationSubmission(db, "ca", "u")).resolves.toEqual({ scheduleId: null, completed: false });
    expect(m.markEvaluationSubmitted).not.toHaveBeenCalled();
    expect(m.updateCandidateSchedule).not.toHaveBeenCalled();
  });

  it("marks the seat but keeps the session open while other seats are pending", async () => {
    m.findOpenEvaluationSeatForApplication.mockResolvedValue({ schedule_id: 7, status: "Confirmed" } as never);
    m.countPendingEvaluationSeats.mockResolvedValue(1);
    await expect(recordEvaluationSubmission(db, "ca", "u")).resolves.toEqual({ scheduleId: "7", completed: false });
    expect(m.markEvaluationSubmitted).toHaveBeenCalledWith(db, "7", "u");
    expect(m.updateCandidateSchedule).not.toHaveBeenCalled();
  });

  it("completes the session (status only) when every seat has submitted", async () => {
    m.findOpenEvaluationSeatForApplication.mockResolvedValue({ schedule_id: 7, status: "Scheduled" } as never);
    m.countPendingEvaluationSeats.mockResolvedValue(0);
    await expect(recordEvaluationSubmission(db, "ca", "u")).resolves.toEqual({ scheduleId: "7", completed: true });
    expect(m.updateCandidateSchedule).toHaveBeenCalledWith(db, "7", { status: "Completed" });
  });

  it("does not re-complete an already Completed session", async () => {
    m.findOpenEvaluationSeatForApplication.mockResolvedValue({ schedule_id: 7, status: "Completed" } as never);
    await expect(recordEvaluationSubmission(db, "ca", "u")).resolves.toEqual({ scheduleId: "7", completed: false });
    expect(m.countPendingEvaluationSeats).not.toHaveBeenCalled();
    expect(m.updateCandidateSchedule).not.toHaveBeenCalled();
  });
});
