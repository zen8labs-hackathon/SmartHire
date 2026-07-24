import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/pipelines/transition-validator", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/pipelines/transition-validator")
  >();
  return {
    ...actual,
    fetchJobPipelineConfig: vi.fn(),
  };
});

import { fetchJobPipelineConfig } from "@/lib/pipelines/transition-validator";
import {
  __resetJobPipelineConfigCacheForTests,
  resolveApplicationStages,
} from "@/lib/candidates/resolve-application-stage";

function fakeDb() {
  return { query: vi.fn() } as never;
}

function stageMapping(id: string, label: string, color: string) {
  return {
    id,
    sequence_number: 1,
    pipeline_stage_id: `${id}-stage`,
    pipeline_stages: {
      id: `${id}-stage`,
      code: label.toLowerCase(),
      label,
      desc: null,
      color,
    },
  };
}

function subStage(
  id: string,
  pipelineStageId: string,
  label: string,
  opts: { isDefault?: boolean; isPassed?: boolean } = {},
) {
  return {
    id,
    pipeline_stage_id: pipelineStageId,
    code: label.toLowerCase(),
    label,
    sequence_number: 1,
    is_default: opts.isDefault ?? false,
    is_passed: opts.isPassed ?? false,
  };
}

beforeEach(() => {
  __resetJobPipelineConfigCacheForTests();
  vi.mocked(fetchJobPipelineConfig).mockReset();
});

describe("resolveApplicationStages", () => {
  it("resolves the row's own explicit stage/sub-stage", async () => {
    const sm = stageMapping("sm-1", "Interview", "violet");
    const ss = subStage("ss-1", sm.pipeline_stage_id, "New", {
      isDefault: true,
    });
    vi.mocked(fetchJobPipelineConfig).mockResolvedValue({
      stageMappings: [sm],
      subStages: [ss],
    });

    const rows = [
      {
        job_id: "job-1",
        current_job_stage_mapping_id: "sm-1",
        current_sub_state_id: "ss-1",
      },
    ];

    const result = await resolveApplicationStages(fakeDb(), rows);

    expect(result.get(rows[0])).toEqual({
      stageLabel: "Interview",
      stageColor: "violet",
      subStageCode: "new",
      subStageLabel: "New",
      subStageIsPassed: false,
    });
  });

  it("falls back to the job's first stage/default sub-stage when the application has no explicit position yet", async () => {
    const sm = stageMapping("sm-1", "CV Scan", "sky");
    const ss = subStage("ss-1", sm.pipeline_stage_id, "New", {
      isDefault: true,
    });
    vi.mocked(fetchJobPipelineConfig).mockResolvedValue({
      stageMappings: [sm],
      subStages: [ss],
    });

    const rows = [
      {
        job_id: "job-1",
        current_job_stage_mapping_id: null,
        current_sub_state_id: null,
      },
    ];

    const result = await resolveApplicationStages(fakeDb(), rows);

    expect(result.get(rows[0])).toEqual({
      stageLabel: "CV Scan",
      stageColor: "sky",
      subStageCode: "new",
      subStageLabel: "New",
      subStageIsPassed: false,
    });
  });

  it("returns all-null (not-started) fields when the job has no pipeline stages at all", async () => {
    vi.mocked(fetchJobPipelineConfig).mockResolvedValue({
      stageMappings: [],
      subStages: [],
    });

    const rows = [
      {
        job_id: "job-1",
        current_job_stage_mapping_id: null,
        current_sub_state_id: null,
      },
    ];

    const result = await resolveApplicationStages(fakeDb(), rows);

    expect(result.get(rows[0])).toEqual({
      stageLabel: null,
      stageColor: null,
      subStageCode: null,
      subStageLabel: null,
      subStageIsPassed: null,
    });
  });

  it("fetches each distinct job's pipeline config only once per call, regardless of row count", async () => {
    const sm = stageMapping("sm-1", "CV Scan", "sky");
    const ss = subStage("ss-1", sm.pipeline_stage_id, "New", {
      isDefault: true,
    });
    vi.mocked(fetchJobPipelineConfig).mockResolvedValue({
      stageMappings: [sm],
      subStages: [ss],
    });

    const rows = [
      {
        job_id: "job-1",
        current_job_stage_mapping_id: null,
        current_sub_state_id: null,
      },
      {
        job_id: "job-1",
        current_job_stage_mapping_id: null,
        current_sub_state_id: null,
      },
      {
        job_id: "job-2",
        current_job_stage_mapping_id: null,
        current_sub_state_id: null,
      },
    ];

    await resolveApplicationStages(fakeDb(), rows);

    expect(fetchJobPipelineConfig).toHaveBeenCalledTimes(2);
  });

  it("caches a job's pipeline config across separate calls within the TTL window", async () => {
    const sm = stageMapping("sm-1", "CV Scan", "sky");
    const ss = subStage("ss-1", sm.pipeline_stage_id, "New", {
      isDefault: true,
    });
    vi.mocked(fetchJobPipelineConfig).mockResolvedValue({
      stageMappings: [sm],
      subStages: [ss],
    });

    const rowA = [
      {
        job_id: "job-1",
        current_job_stage_mapping_id: null,
        current_sub_state_id: null,
      },
    ];
    const rowB = [
      {
        job_id: "job-1",
        current_job_stage_mapping_id: null,
        current_sub_state_id: null,
      },
    ];

    await resolveApplicationStages(fakeDb(), rowA);
    await resolveApplicationStages(fakeDb(), rowB);

    expect(fetchJobPipelineConfig).toHaveBeenCalledTimes(1);
  });
});
