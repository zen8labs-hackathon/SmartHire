import { describe, expect, it } from "vitest";

import { stageMoveCascadeReason } from "./stage-move-cascade";

const base = { stageChanged: false, subChanged: false, target: undefined, cancelUpcomingSessions: undefined };

describe("stageMoveCascadeReason", () => {
  it("rejects -> rejected reason", () => {
    expect(stageMoveCascadeReason({ ...base, subChanged: true, target: { is_terminal: true } })).toBe("The candidate was rejected.");
  });
  it("withdraw -> withdrew reason", () => {
    expect(stageMoveCascadeReason({ ...base, subChanged: true, target: { is_withdraw: true } })).toBe("The candidate withdrew.");
  });
  it("stage move cancels only when opted in", () => {
    expect(stageMoveCascadeReason({ ...base, stageChanged: true })).toBeNull();
    expect(stageMoveCascadeReason({ ...base, stageChanged: true, cancelUpcomingSessions: true })).toBe("Candidate moved to another stage");
  });
});
