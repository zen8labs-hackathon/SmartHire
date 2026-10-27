import { describe, expect, it } from "vitest";

import {
  buildConversionPlan,
  type ApplicationInfo,
  type ConversionInputs,
  type OldMappingInfo,
  type PipelineRowInfo,
  type SubStageInfo,
} from "@/lib/db/legacy-job-plan";

const row = (n: number, stage: string, over: Partial<PipelineRowInfo> = {}): PipelineRowInfo => ({
  id: `row${n}`,
  pipeline_stage_id: stage,
  sequence_number: n,
  sla_days: 3,
  schedule: false,
  stage_code: stage,
  stage_label: stage,
  stage_type: null,
  stage_deleted: false,
  ...over,
});
const old = (n: number, stage: string, over: Partial<OldMappingInfo> = {}): OldMappingInfo => ({
  id: `old${n}`,
  pipeline_stage_id: stage,
  sequence_number: n,
  sla_days: 3,
  schedule: false,
  pipeline_row_id: null,
  stage_label: stage,
  stage_deleted: false,
  ...over,
});
const app = (id: string, mapping: string, over: Partial<ApplicationInfo> = {}): ApplicationInfo => ({
  id,
  mapping_id: mapping,
  sub_state_id: null,
  hired_at: null,
  updated_at: "2026-01-01T00:00:00.000Z",
  deleted_at: null,
  mapping_deleted: false,
  ...over,
});
const sub = (id: string, stage: string, code: string, isDefault = false): SubStageInfo => ({
  id,
  pipeline_stage_id: stage,
  code,
  is_default: isDefault,
  deleted_at: null,
});

const base = (over: Partial<ConversionInputs> = {}): ConversionInputs => ({
  job: { id: "job", flow_version: 1, pipeline_id: null },
  pipelineUsable: true,
  rows: [row(1, "A"), row(2, "B")],
  oldMappings: [old(1, "A"), old(2, "B")],
  applications: [],
  subStages: [],
  stageVersions: [],
  probationOtherJobs: [],
  ...over,
});
const pairs = [
  { oldMappingId: "old1", pipelineRowId: "row1" },
  { oldMappingId: "old2", pipelineRowId: "row2" },
];
const codes = (xs: { code: string }[]) => xs.map((x) => x.code);

describe("buildConversionPlan", () => {
  it("adopts in place when the stage set matches exactly", () => {
    const plan = buildConversionPlan(base(), "pl", pairs);
    expect(plan.blockers).toEqual([]);
    expect(plan.mode).toBe("in_place");
    expect(plan.repoints).toEqual([]);
  });

  it("remaps when the pipeline has extra stages", () => {
    const plan = buildConversionPlan(base({ rows: [row(1, "A"), row(2, "B"), row(3, "C")] }), "pl", pairs);
    expect(plan.blockers).toEqual([]);
    expect(plan.mode).toBe("remap");
  });

  it("blocks non-legacy jobs, missing jobs and unusable pipelines", () => {
    expect(codes(buildConversionPlan(base({ job: { id: "job", flow_version: 2, pipeline_id: "x" } }), "pl", pairs).blockers)).toContain("NOT_LEGACY");
    expect(codes(buildConversionPlan(base({ job: null }), "pl", pairs).blockers)).toContain("JOB_NOT_FOUND");
    expect(codes(buildConversionPlan(base({ pipelineUsable: false }), "pl", pairs).blockers)).toContain("PIPELINE_UNUSABLE");
  });

  it("blocks incomplete, duplicate and unknown mappings", () => {
    expect(codes(buildConversionPlan(base(), "pl", pairs.slice(0, 1)).blockers)).toContain("MAPPING_INCOMPLETE");
    expect(
      codes(buildConversionPlan(base(), "pl", [pairs[0], { oldMappingId: "old2", pipelineRowId: "row1" }]).blockers),
    ).toContain("ROW_USED_TWICE");
    expect(
      codes(buildConversionPlan(base(), "pl", [pairs[0], { oldMappingId: "nope", pipelineRowId: "row2" }]).blockers),
    ).toContain("MAPPING_UNKNOWN_OLD");
    expect(
      codes(buildConversionPlan(base(), "pl", [pairs[0], { oldMappingId: "old2", pipelineRowId: "nope" }]).blockers),
    ).toContain("MAPPING_UNKNOWN_ROW");
  });

  it("repoints candidates and keeps same-code sub-states on remap", () => {
    const plan = buildConversionPlan(
      base({
        rows: [row(1, "A"), row(2, "C"), row(3, "B")],
        applications: [app("a1", "old2", { sub_state_id: "sB-new" })],
        subStages: [sub("sB-new", "B", "new", true), sub("sC-new", "C", "new", true)],
      }),
      "pl",
      [
        { oldMappingId: "old1", pipelineRowId: "row1" },
        { oldMappingId: "old2", pipelineRowId: "row3" },
      ],
    );
    expect(plan.blockers).toEqual([]);
    expect(plan.mode).toBe("remap");
    expect(plan.repoints[0]).toMatchObject({ applicationId: "a1", toRowId: "row3", toSubStateId: "sB-new" });
  });

  it("remaps a sub-state to the same code, else the default of a different stage", () => {
    const plan = buildConversionPlan(
      base({
        rows: [row(1, "A"), row(2, "C")],
        oldMappings: [old(1, "A"), old(2, "B")],
        applications: [app("a1", "old2", { sub_state_id: "sB-x" }), app("a2", "old2", { sub_state_id: "sB-y" })],
        subStages: [
          sub("sB-x", "B", "x"),
          sub("sB-y", "B", "y"),
          sub("sC-x", "C", "x"),
          sub("sC-d", "C", "d", true),
        ],
      }),
      "pl",
      pairs,
    );
    const byApp = Object.fromEntries(plan.repoints.map((r) => [r.applicationId, r]));
    expect(byApp.a1.toSubStateId).toBe("sC-x");
    expect(byApp.a2.toSubStateId).toBe("sC-d");
    expect(plan.warnings.map((w) => w.code)).toContain("SUBSTATE_REMAPPED");
  });

  it("blocks when a sub-state cannot be resolved", () => {
    const plan = buildConversionPlan(
      base({
        rows: [row(1, "A"), row(2, "C")],
        applications: [app("a1", "old2", { sub_state_id: "sB-x" })],
        subStages: [sub("sB-x", "B", "x"), sub("sC-z", "C", "z")],
      }),
      "pl",
      pairs,
    );
    expect(codes(plan.blockers)).toContain("SUBSTATE_UNRESOLVED");
  });

  it("sets hired_at only for candidates in the probation stage", () => {
    const plan = buildConversionPlan(
      base({
        rows: [row(1, "A"), row(2, "B", { stage_type: "probation" })],
        applications: [
          app("a1", "old1", { hired_at: "2026-02-02T00:00:00.000Z" }),
          app("a2", "old2"),
        ],
      }),
      "pl",
      pairs,
    );
    const byApp = Object.fromEntries(plan.hiredAtChanges.map((c) => [c.applicationId, c]));
    expect(byApp.a1.to).toBeNull();
    expect(byApp.a2.to).toBe("2026-01-01T00:00:00.000Z");
  });

  it("has a stable fingerprint that changes with the configuration", () => {
    const a = buildConversionPlan(base(), "pl", pairs).fingerprint;
    expect(buildConversionPlan(base(), "pl", [...pairs].reverse()).fingerprint).toBe(a);
    expect(
      buildConversionPlan(base({ stageVersions: [{ id: "A", updated_at: "2026-03-03" }] }), "pl", pairs).fingerprint,
    ).not.toBe(a);
  });
});
