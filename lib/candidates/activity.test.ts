import { describe, expect, it } from "vitest";
import { scheduleEvents } from "./activity";

const base = {
  status: "Scheduled" as const,
  round_label: "Tech round",
  created_at: new Date("2026-10-01T02:00:00Z"),
  created_by: "u1",
  rescheduled_from_id: null,
  reschedule_reason: null,
  cancel_reason: null,
  canceled_by: null,
  canceled_at: null,
};

describe("scheduleEvents", () => {
  it("logs a new round as scheduled", () => {
    expect(scheduleEvents(base)).toEqual([
      { at: base.created_at, text: "scheduled Tech round", userId: "u1", reason: null },
    ]);
  });

  it("keeps the old row as scheduled and puts the reason on the new row", () => {
    expect(scheduleEvents({ ...base, status: "Rescheduled" })[0].text).toBe("scheduled Tech round");
    const [e] = scheduleEvents({ ...base, rescheduled_from_id: "s0", reschedule_reason: "Candidate is sick" });
    expect(e).toMatchObject({ text: "rescheduled Tech round", reason: "Candidate is sick" });
  });

  it("adds a cancel event at canceled_at with its reason", () => {
    const at = new Date("2026-10-02T03:00:00Z");
    const events = scheduleEvents({ ...base, status: "Canceled", canceled_at: at, canceled_by: "u2", cancel_reason: "Role filled" });
    expect(events).toHaveLength(2);
    expect(events[1]).toEqual({ at, text: "canceled Tech round", userId: "u2", reason: "Role filled" });
  });
});
