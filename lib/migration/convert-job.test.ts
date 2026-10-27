import { describe, expect, it, vi } from "vitest";

import type { QueryExecutor } from "@/lib/db/config/client";
import { ConversionError, applyJobConversion } from "@/lib/migration/convert-job";

vi.mock("@/lib/db/legacy-job-plan", async (orig) => {
  const actual = await orig<typeof import("@/lib/db/legacy-job-plan")>();
  return { ...actual, loadConversionInputs: vi.fn(), };
});
vi.mock("@/lib/db/pipelines", () => ({
  adoptPipelineForLegacyJob: vi.fn(async () => ({ mode: "in_place", marker: "snap" })),
}));

vi.mock("@/lib/migration/job-data-plan", async (orig) => {
  const actual = await orig<typeof import("@/lib/migration/job-data-plan")>();
  return { ...actual, loadDataInputs: vi.fn(async () => ({ hireType: null, schedules: [], seats: [], reviews: [] })) };
});

import { loadConversionInputs } from "@/lib/db/legacy-job-plan";
import { adoptPipelineForLegacyJob } from "@/lib/db/pipelines";

const inputs = {
  job: { id: "j", flow_version: 1, pipeline_id: null },
  pipelineUsable: true,
  rows: [{ id: "r1", pipeline_stage_id: "A", sequence_number: 1, sla_days: 1, schedule: false, stage_code: "A", stage_label: "A", stage_type: null, stage_deleted: false }],
  oldMappings: [{ id: "o1", pipeline_stage_id: "A", sequence_number: 1, sla_days: 1, schedule: false, pipeline_row_id: null, stage_label: "A", stage_deleted: false }],
  applications: [],
  subStages: [],
  stageVersions: [],
  probationOtherJobs: [],
};
const input = { jobId: "j", pipelineId: "p", pairs: [{ oldMappingId: "o1", pipelineRowId: "r1" }] };

const tx = (responses: Record<string, unknown[]>) => {
  const query = vi.fn(async (sql: string) => {
    for (const [k, rows] of Object.entries(responses)) if (sql.includes(k)) return { rows };
    return { rows: [] };
  });
  return { query } as unknown as QueryExecutor & { query: typeof query };
};

describe("applyJobConversion", () => {
  it("applies and audits when the fingerprint matches", async () => {
    vi.mocked(loadConversionInputs).mockResolvedValue(structuredClone(inputs) as never);
    const { dryRunJobConversion } = await import("@/lib/migration/convert-job");
    const fp = (await dryRunJobConversion(tx({}), input)).fingerprint;
    const db = tx({ "FOR UPDATE": [{ "?column?": 1 }], "INSERT INTO legacy_migrations": [{ id: "42" }] });
    const res = await applyJobConversion(db, input, fp, "u1");
    expect(res.migrationId).toBe("42");
    expect(adoptPipelineForLegacyJob).toHaveBeenCalled();
  });

  it("rejects a stale fingerprint without changing anything", async () => {
    vi.mocked(loadConversionInputs).mockResolvedValue(structuredClone(inputs) as never);
    vi.mocked(adoptPipelineForLegacyJob).mockClear();
    const db = tx({ "FOR UPDATE": [{}] });
    await expect(applyJobConversion(db, input, "old", "u1")).rejects.toMatchObject({ code: "STALE_PLAN" });
    expect(adoptPipelineForLegacyJob).not.toHaveBeenCalled();
  });

  it("rejects blocked plans and unknown jobs", async () => {
    vi.mocked(loadConversionInputs).mockResolvedValue({ ...structuredClone(inputs), pipelineUsable: false } as never);
    await expect(applyJobConversion(tx({ "FOR UPDATE": [{}] }), input, "x", "u")).rejects.toMatchObject({ code: "BLOCKED" });
    await expect(applyJobConversion(tx({}), input, "x", "u")).rejects.toMatchObject({ code: "JOB_NOT_FOUND" });
  });
});
