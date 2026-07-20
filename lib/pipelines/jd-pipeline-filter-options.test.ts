import { describe, expect, it } from "vitest";
import {
  buildPipelineStageSubStageFilterOptions,
  countByStageMappingId,
} from "./jd-pipeline-filter-options";
import type { StageMapping, SubStage } from "./transition-validator";

const mockStageMappings: StageMapping[] = [
  {
    id: "mapping-cv-scan",
    sequence_number: 1,
    pipeline_stage_id: "stage-cv-scan",
    pipeline_stages: {
      id: "stage-cv-scan",
      code: "cv_scan",
      label: "CV Scan",
      desc: null,
      color: "sky",
    },
  },
  {
    id: "mapping-custom",
    sequence_number: 2,
    pipeline_stage_id: "stage-custom",
    pipeline_stages: {
      id: "stage-custom",
      code: "vendor_review",
      label: "Vendor Review",
      desc: null,
      color: "violet",
    },
  },
];

const mockSubStages: SubStage[] = [
  {
    id: "sub-cv-passed",
    pipeline_stage_id: "stage-cv-scan",
    code: "passed",
    label: "Passed",
    sequence_number: 2,
    is_default: false,
    is_passed: true,
  },
  {
    id: "sub-cv-new",
    pipeline_stage_id: "stage-cv-scan",
    code: "new",
    label: "New",
    sequence_number: 1,
    is_default: true,
    is_passed: false,
  },
  {
    id: "sub-custom-review",
    pipeline_stage_id: "stage-custom",
    code: "in_review",
    label: "In Review",
    sequence_number: 1,
    is_default: true,
    is_passed: false,
  },
];

describe("buildPipelineStageSubStageFilterOptions", () => {
  it("orders options by stage sequence_number then sub-stage sequence_number", () => {
    const options = buildPipelineStageSubStageFilterOptions(
      mockStageMappings,
      mockSubStages,
    );

    expect(options.map((o) => o.id)).toEqual([
      "mapping-cv-scan:sub-cv-new",
      "mapping-cv-scan:sub-cv-passed",
      "mapping-custom:sub-custom-review",
    ]);
  });

  it("returns an empty array when there are no stage mappings", () => {
    expect(buildPipelineStageSubStageFilterOptions([], [])).toEqual([]);
  });
});

describe("countByStageMappingId", () => {
  it("zero-fills every stage mapping and counts matching ids", () => {
    const counts = countByStageMappingId(
      ["mapping-cv-scan", "mapping-cv-scan", "mapping-custom", null],
      mockStageMappings,
    );
    expect(counts).toEqual({
      "mapping-cv-scan": 2,
      "mapping-custom": 1,
    });
  });

  it("ignores ids that don't match any known stage mapping", () => {
    const counts = countByStageMappingId(
      ["stale-mapping-id"],
      mockStageMappings,
    );
    expect(counts).toEqual({
      "mapping-cv-scan": 0,
      "mapping-custom": 0,
    });
  });

  it("returns all-zero counts when no ids are given", () => {
    const counts = countByStageMappingId([], mockStageMappings);
    expect(counts).toEqual({
      "mapping-cv-scan": 0,
      "mapping-custom": 0,
    });
  });
});
