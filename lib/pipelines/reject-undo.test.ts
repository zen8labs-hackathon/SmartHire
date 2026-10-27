import { describe, expect, it } from "vitest";

import { planRejectUndo, REJECT_UNDO_WINDOW_MS } from "./reject-undo";
import type { StageMapping, SubStage } from "./transition-validator";

const mapping = (id: string, stageId: string): StageMapping => ({
  id,
  sequence_number: 1,
  pipeline_stage_id: stageId,
  pipeline_stages: null,
});
const sub = (id: string, stageId: string, flags: Partial<SubStage> = {}): SubStage => ({
  id,
  pipeline_stage_id: stageId,
  code: id,
  label: id,
  sequence_number: 1,
  is_default: false,
  is_passed: false,
  is_terminal: false,
  is_withdraw: false,
  ...flags,
});

const stageMappings = [mapping("m1", "s1")];
const subStages = [
  sub("inProgress", "s1", { is_default: true }),
  sub("rejected", "s1", { is_terminal: true }),
  sub("withdrew", "s1", { is_terminal: true, is_withdraw: true }),
];
const now = new Date("2026-10-23T10:00:00Z");
const latest = {
  from_stage_mapping_id: "m1",
  from_sub_state_id: "inProgress",
  to_stage_mapping_id: "m1",
  to_sub_state_id: "rejected",
  at: new Date(now.getTime() - 60_000),
};
const current = { stageMappingId: "m1", subStateId: "rejected" };

describe("planRejectUndo", () => {
  it("restores the pre-reject stage and sub-stage", () => {
    expect(planRejectUndo({ latest, current, stageMappings, subStages, now })).toEqual({
      ok: true,
      toStageMappingId: "m1",
      toSubStateId: "inProgress",
    });
  });

  it("refuses when there is no history", () => {
    expect(planRejectUndo({ latest: null, current, stageMappings, subStages, now }).ok).toBe(false);
  });

  it("refuses when the last change was not a reject", () => {
    const r = planRejectUndo({
      latest: { ...latest, to_sub_state_id: "withdrew" },
      current: { stageMappingId: "m1", subStateId: "withdrew" },
      stageMappings,
      subStages,
      now,
    });
    expect(r).toMatchObject({ ok: false, status: 409 });
  });

  it("refuses when the candidate moved after the reject", () => {
    const r = planRejectUndo({
      latest,
      current: { stageMappingId: "m1", subStateId: "inProgress" },
      stageMappings,
      subStages,
      now,
    });
    expect(r).toMatchObject({ ok: false, status: 409 });
  });

  it("refuses after the 10-minute window", () => {
    const r = planRejectUndo({
      latest: { ...latest, at: new Date(now.getTime() - REJECT_UNDO_WINDOW_MS - 1) },
      current,
      stageMappings,
      subStages,
      now,
    });
    expect(r).toMatchObject({ ok: false, status: 409 });
  });

  it("accepts exactly at the window edge and ISO string timestamps", () => {
    const r = planRejectUndo({
      latest: { ...latest, at: new Date(now.getTime() - REJECT_UNDO_WINDOW_MS).toISOString() },
      current,
      stageMappings,
      subStages,
      now,
    });
    expect(r.ok).toBe(true);
  });

  it("refuses when the previous position is gone or unknown", () => {
    for (const patch of [
      { from_stage_mapping_id: null },
      { from_sub_state_id: null },
      { from_stage_mapping_id: "gone" },
    ]) {
      const r = planRejectUndo({ latest: { ...latest, ...patch }, current, stageMappings, subStages, now });
      expect(r).toMatchObject({ ok: false, status: 400 });
    }
  });
});
