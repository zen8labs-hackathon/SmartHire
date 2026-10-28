import { describe, expect, it } from "vitest";

import type { JobRow } from "@/lib/db/jobs";
import type { StageMapping, SubStage } from "@/lib/pipelines/transition-validator";
import { DRAFT_MARKER } from "@/lib/position/jd-state";
import {
  STATUS_REASON_MAX,
  planTransition,
  summarizeCloseState,
} from "@/lib/position/transition";

function job(over: Partial<JobRow> = {}): JobRow {
  return {
    id: "job-1",
    status: "Hiring",
    update_note: null,
    position: "Backend Engineer",
    start_date: "2026-10-01",
    hiring_deadline: "2026-12-01",
    jd_storage_path: null,
    updated_at: new Date("2026-10-20T00:00:00Z"),
    ...over,
  } as JobRow;
}

const hr = { isHr: true, userId: "u-1", today: "2026-10-23" };

describe("planTransition", () => {
  it("rejects hold/reopen/close for non-HR users", () => {
    for (const to of ["hold", "reopen", "close"] as const) {
      const r = planTransition(job(), to, { ...hr, isHr: false, reason: "x" });
      expect(r).toMatchObject({ ok: false, status: 403 });
    }
  });

  it("requires a non-blank reason for hold and reopen", () => {
    expect(planTransition(job(), "hold", hr)).toMatchObject({ ok: false, status: 400 });
    expect(planTransition(job(), "hold", { ...hr, reason: "   " })).toMatchObject({ ok: false, status: 400 });
    expect(planTransition(job({ status: "Pending" }), "reopen", hr)).toMatchObject({ ok: false, status: 400 });
  });

  it("does not require a reason to close", () => {
    expect(planTransition(job(), "close", hr).ok).toBe(true);
  });

  it("caps the reason length", () => {
    const long = "a".repeat(STATUS_REASON_MAX + 1);
    expect(planTransition(job(), "hold", { ...hr, reason: long })).toMatchObject({ ok: false, status: 400 });
    expect(planTransition(job(), "hold", { ...hr, reason: "a".repeat(STATUS_REASON_MAX) }).ok).toBe(true);
  });

  it("stores the trimmed reason on hold", () => {
    const r = planTransition(job(), "hold", { ...hr, reason: "  budget freeze  " });
    expect(r).toEqual({
      ok: true,
      patch: { status: "Pending", updateNote: null, updatedBy: "u-1", statusReason: "budget freeze" },
    });
  });

  it("reopen clears end date and the close snapshot", () => {
    const r = planTransition(job({ status: "Done" }), "reopen", { ...hr, reason: "new budget" });
    expect(r.ok && r.patch).toMatchObject({
      status: "Hiring",
      endDate: null,
      statusReason: "new budget",
      closeSnapshot: null,
    });
  });

  it("close sets the end date and leaves the reason untouched", () => {
    const r = planTransition(job({ status: "Pending" }), "close", hr);
    expect(r.ok && r.patch).toEqual({ status: "Done", updateNote: null, updatedBy: "u-1", endDate: "2026-10-23" });
  });

  it("opening a draft needs only the deadline and starts hiring today", () => {
    const draft = (over: Partial<JobRow> = {}) =>
      job({ status: "Pending", update_note: DRAFT_MARKER, start_date: null, ...over });
    const r = planTransition(draft(), "open", hr);
    expect(r.ok && r.patch).toMatchObject({ status: "Hiring", startDate: "2026-10-23" });
    expect(planTransition(draft({ hiring_deadline: null }), "open", hr)).toMatchObject({ ok: false, status: 400 });
  });

  it("opening keeps an existing start date", () => {
    const r = planTransition(job({ status: "Pending", update_note: DRAFT_MARKER }), "open", hr);
    expect(r.ok && r.patch).not.toHaveProperty("startDate");
  });

  it("refuses transitions from the wrong status", () => {
    expect(planTransition(job({ status: "Pending" }), "hold", { ...hr, reason: "x" })).toMatchObject({ ok: false, status: 409 });
    expect(planTransition(job(), "reopen", { ...hr, reason: "x" })).toMatchObject({ ok: false, status: 409 });
    expect(planTransition(job({ status: "Done" }), "close", hr)).toMatchObject({ ok: false, status: 409 });
  });
});

describe("summarizeCloseState", () => {
  const stage = (id: string, seq: number, label: string, stage_type: string): StageMapping => ({
    id: `m-${id}`,
    sequence_number: seq,
    pipeline_stage_id: `s-${id}`,
    pipeline_stages: { id: `s-${id}`, code: id, label, desc: null, color: null, allow_schedule: false, stage_type },
  });
  const sub = (stageId: string, id: string, flags: Partial<SubStage> = {}): SubStage => ({
    id,
    pipeline_stage_id: `s-${stageId}`,
    code: id,
    label: id,
    sequence_number: 1,
    is_default: false,
    is_passed: false,
    is_terminal: false,
    is_withdraw: false,
    ...flags,
  });

  // The first mapping is the entry stage (unset candidates fall back to it);
  // the rest are out of order on purpose: the snapshot follows sequence_number.
  const mappings = [stage("screen", 1, "Screening", "none"), stage("prob", 3, "Probation", "probation"), stage("offer", 2, "Offer", "offer")];
  const subs = [
    sub("screen", "screen-new", { is_default: true }),
    sub("offer", "offer-new", { is_default: true }),
    sub("offer", "offer-rejected", { is_terminal: true }),
    sub("offer", "offer-withdrawn", { is_withdraw: true }),
    sub("prob", "prob-new", { is_default: true }),
  ];
  const row = (id: string, m: string | null, s: string | null, name: string | null = id) => ({
    id,
    name,
    current_job_stage_mapping_id: m,
    current_sub_state_id: s,
  });

  it("counts candidates per stage in pipeline order", () => {
    const { snapshot } = summarizeCloseState(
      [row("a", null, null), row("b", "m-screen", "screen-new"), row("c", "m-offer", "offer-rejected")],
      mappings,
      subs,
      new Date("2026-10-23T00:00:00Z"),
    );
    expect(snapshot).toEqual({
      closedAt: "2026-10-23T00:00:00.000Z",
      total: 3,
      stages: [
        { stageMappingId: "m-screen", label: "Screening", stageType: "none", count: 2 },
        { stageMappingId: "m-offer", label: "Offer", stageType: "offer", count: 1 },
        { stageMappingId: "m-prob", label: "Probation", stageType: "probation", count: 0 },
      ],
    });
  });

  it("blocks on active offer/probation candidates only", () => {
    const { blocking } = summarizeCloseState(
      [
        row("a", "m-offer", "offer-new", "Ann"),
        row("b", "m-prob", "prob-new", null),
        row("c", "m-offer", "offer-rejected"),
        row("d", "m-offer", "offer-withdrawn"),
        row("e", "m-screen", "screen-new"),
      ],
      mappings,
      subs,
    );
    expect(blocking).toEqual([
      { id: "a", name: "Ann", stage: "Offer" },
      { id: "b", name: "Unnamed candidate", stage: "Probation" },
    ]);
  });

  it("does not block when nobody is in offer/probation", () => {
    expect(summarizeCloseState([row("a", null, null)], mappings, subs).blocking).toEqual([]);
  });
});
