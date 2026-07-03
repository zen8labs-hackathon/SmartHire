import { describe, expect, it } from "vitest";
import {
  resolveCandidatePipelineIds,
  wasCandidateStageOrphaned,
  isCustomTransitionAllowed,
  buildNewPipelineCandidatePatch,
  legacyStatusForStageSubStage,
  type StageMapping,
  type SubStage,
} from "./transition-validator";

const mockStageMappings: StageMapping[] = [
  {
    id: "mapping-cv-scan",
    sequence_number: 1,
    pipeline_stage_id: "stage-cv-scan",
    pipeline_stages: {
      id: "stage-cv-scan",
      code: "cv_scan",
      label: "CV Scan",
      desc: "CV Scan desc",
      color: "sky",
    },
  },
  {
    id: "mapping-interview",
    sequence_number: 2,
    pipeline_stage_id: "stage-interview",
    pipeline_stages: {
      id: "stage-interview",
      code: "interview",
      label: "Interview",
      desc: "Interview desc",
      color: "violet",
    },
  },
  {
    id: "mapping-offer",
    sequence_number: 3,
    pipeline_stage_id: "stage-offer",
    pipeline_stages: {
      id: "stage-offer",
      code: "offer",
      label: "Offer",
      desc: "Offer desc",
      color: "teal",
    },
  },
];

const mockSubStages: SubStage[] = [
  // CV Scan sub-stages
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
    id: "sub-cv-passed",
    pipeline_stage_id: "stage-cv-scan",
    code: "passed",
    label: "Passed",
    sequence_number: 2,
    is_default: false,
    is_passed: true,
  },
  // Interview sub-stages
  {
    id: "sub-int-interview",
    pipeline_stage_id: "stage-interview",
    code: "interview",
    label: "Interview",
    sequence_number: 1,
    is_default: true,
    is_passed: false,
  },
  {
    id: "sub-int-passed",
    pipeline_stage_id: "stage-interview",
    code: "passed",
    label: "Passed",
    sequence_number: 2,
    is_default: false,
    is_passed: true,
  },
  // Offer sub-stages
  {
    id: "sub-offer-default",
    pipeline_stage_id: "stage-offer",
    code: "offer",
    label: "Offer",
    sequence_number: 1,
    is_default: true,
    is_passed: false,
  },
  {
    id: "sub-offer-passed",
    pipeline_stage_id: "stage-offer",
    code: "passed",
    label: "Passed",
    sequence_number: 2,
    is_default: false,
    is_passed: true,
  },
];

describe("resolveCandidatePipelineIds", () => {
  it("uses existing IDs if present", () => {
    // Ids must be "live" (i.e. present in stageMappings) to be trusted as-is;
    // see the "recovers stage mapping id via sub-state" test below for the
    // stale-id case.
    const candidate = {
      current_job_stage_mapping_id: "mapping-interview",
      current_sub_state_id: "sub-int-interview",
    };
    const result = resolveCandidatePipelineIds(candidate, mockStageMappings, mockSubStages);
    expect(result.stageMappingId).toBe("mapping-interview");
    expect(result.subStateId).toBe("sub-int-interview");
  });

  it("falls back to first stage default sub-stage if IDs and status are null", () => {
    const candidate = {
      current_job_stage_mapping_id: null,
      current_sub_state_id: null,
    };
    const result = resolveCandidatePipelineIds(candidate, mockStageMappings, mockSubStages);
    expect(result.stageMappingId).toBe("mapping-cv-scan");
    expect(result.subStateId).toBe("sub-cv-new");
  });

  it("resolves correct stage and sub-stage from legacy candidate status string", () => {
    const candidate = {
      current_job_stage_mapping_id: null,
      current_sub_state_id: null,
      status: "Interview",
    };
    const result = resolveCandidatePipelineIds(candidate, mockStageMappings, mockSubStages);
    expect(result.stageMappingId).toBe("mapping-interview");
    expect(result.subStateId).toBe("sub-int-interview");
  });

  it("recovers stage mapping id via sub-state when stored stageMappingId is stale", () => {
    const candidate = {
      current_job_stage_mapping_id: "stale-mapping-id-not-in-list",
      current_sub_state_id: "sub-int-interview",
    };
    const result = resolveCandidatePipelineIds(candidate, mockStageMappings, mockSubStages);
    expect(result.stageMappingId).toBe("mapping-interview");
    expect(result.stageMappingId).not.toBe("stale-mapping-id-not-in-list");
    expect(result.subStateId).toBe("sub-int-interview");
  });

  it("falls back to legacy status when both ids are stale/unresolvable", () => {
    const candidate = {
      current_job_stage_mapping_id: "stale-mapping-id",
      current_sub_state_id: "stale-sub-state-id",
      status: "Interview",
    };
    const result = resolveCandidatePipelineIds(candidate, mockStageMappings, mockSubStages);
    expect(result.stageMappingId).toBe("mapping-interview");
    expect(result.subStateId).toBe("sub-int-interview");
  });

  it("falls back to first-stage default when stageMappingId is stale and no status set", () => {
    const candidate = {
      current_job_stage_mapping_id: "stale-mapping-id",
      current_sub_state_id: "stale-sub-state-id",
    };
    const result = resolveCandidatePipelineIds(candidate, mockStageMappings, mockSubStages);
    expect(result.stageMappingId).toBe("mapping-cv-scan");
    expect(result.subStateId).toBe("sub-cv-new");
  });
});

describe("wasCandidateStageOrphaned", () => {
  it("returns false when ids are both null (never assigned)", () => {
    const candidate = {
      current_job_stage_mapping_id: null,
      current_sub_state_id: null,
    };
    expect(wasCandidateStageOrphaned(candidate, mockStageMappings, mockSubStages)).toBe(false);
  });

  it("returns false when the stored stageMappingId is live", () => {
    const candidate = {
      current_job_stage_mapping_id: "mapping-interview",
      current_sub_state_id: "sub-int-interview",
    };
    expect(wasCandidateStageOrphaned(candidate, mockStageMappings, mockSubStages)).toBe(false);
  });

  it("returns false when stale but recoverable via sub-state's pipeline_stage_id", () => {
    const candidate = {
      current_job_stage_mapping_id: "stale-mapping-id-not-in-list",
      current_sub_state_id: "sub-int-interview",
    };
    expect(wasCandidateStageOrphaned(candidate, mockStageMappings, mockSubStages)).toBe(false);
  });

  it("returns true when stale and not recoverable (stage genuinely removed)", () => {
    const candidate = {
      current_job_stage_mapping_id: "stale-mapping-id",
      current_sub_state_id: "stale-sub-state-id",
    };
    expect(wasCandidateStageOrphaned(candidate, mockStageMappings, mockSubStages)).toBe(true);
  });
});

describe("isCustomTransitionAllowed", () => {
  it("allows transitions within the same stage", () => {
    const allowed = isCustomTransitionAllowed(
      mockStageMappings,
      mockSubStages,
      "mapping-cv-scan",
      "sub-cv-new",
      "mapping-cv-scan",
      "sub-cv-passed"
    );
    expect(allowed).toBe(true);
  });

  it("allows consecutive forward transition from passed sub-stage to next default sub-stage", () => {
    const allowed = isCustomTransitionAllowed(
      mockStageMappings,
      mockSubStages,
      "mapping-cv-scan",
      "sub-cv-passed",
      "mapping-interview",
      "sub-int-interview"
    );
    expect(allowed).toBe(true);
  });

  it("blocks consecutive forward transition from non-passed sub-stage to next default sub-stage", () => {
    const allowed = isCustomTransitionAllowed(
      mockStageMappings,
      mockSubStages,
      "mapping-cv-scan",
      "sub-cv-new",
      "mapping-interview",
      "sub-int-interview"
    );
    expect(allowed).toBe(false);
  });

  it("blocks consecutive forward transition from passed sub-stage to next non-default sub-stage", () => {
    const allowed = isCustomTransitionAllowed(
      mockStageMappings,
      mockSubStages,
      "mapping-cv-scan",
      "sub-cv-passed",
      "mapping-interview",
      "sub-int-passed"
    );
    expect(allowed).toBe(false);
  });

  it("allows consecutive backward rollback from default sub-stage to previous passed sub-stage", () => {
    const allowed = isCustomTransitionAllowed(
      mockStageMappings,
      mockSubStages,
      "mapping-interview",
      "sub-int-interview",
      "mapping-cv-scan",
      "sub-cv-passed"
    );
    expect(allowed).toBe(true);
  });

  it("blocks non-consecutive transitions (e.g. stage 1 to stage 3)", () => {
    const allowed = isCustomTransitionAllowed(
      mockStageMappings,
      mockSubStages,
      "mapping-cv-scan",
      "sub-cv-passed",
      "mapping-offer",
      "sub-int-interview"
    );
    expect(allowed).toBe(false);
  });
});

describe("buildNewPipelineCandidatePatch", () => {
  it("builds correct database patch and dual-writes the closest legacy status", () => {
    const prev = {
      current_job_stage_mapping_id: "mapping-cv-scan",
      current_sub_state_id: "sub-cv-new",
      interview_at: null,
      onboarding_at: null,
    };
    const update = {
      toStageMappingId: "mapping-interview",
      toSubStateId: "sub-int-interview",
    };
    const patch = buildNewPipelineCandidatePatch(prev, update, mockStageMappings, mockSubStages);
    expect(patch.current_job_stage_mapping_id).toBe("mapping-interview");
    expect(patch.current_sub_state_id).toBe("sub-int-interview");
    expect(patch.pipeline_status).toBe("interview:interview");
    // Dual-write: legacy `status` is kept in sync in the same atomic patch so
    // consumers still reading `status` directly don't go stale.
    expect(patch.status).toBe("Interview");
    expect(patch.interview_at).toBeTruthy(); // interview_at auto-initialized
  });

  it("sets offered_at but keeps onboarding_at null when entering default offer sub-stage", () => {
    const prev = {
      current_job_stage_mapping_id: "mapping-interview",
      current_sub_state_id: "sub-int-passed",
      offered_at: null,
      onboarding_at: null,
    };
    const update = {
      toStageMappingId: "mapping-offer",
      toSubStateId: "sub-offer-default",
    };
    const patch = buildNewPipelineCandidatePatch(prev, update, mockStageMappings, mockSubStages);
    expect(patch.offered_at).toBeTruthy();
    expect(patch.onboarding_at).toBeNull();
  });

  it("sets offered_at and onboarding_at when entering passed offer sub-stage", () => {
    const prev = {
      current_job_stage_mapping_id: "mapping-interview",
      current_sub_state_id: "sub-int-passed",
      offered_at: null,
      onboarding_at: null,
    };
    const update = {
      toStageMappingId: "mapping-offer",
      toSubStateId: "sub-offer-passed",
    };
    const patch = buildNewPipelineCandidatePatch(prev, update, mockStageMappings, mockSubStages);
    expect(patch.offered_at).toBeTruthy();
    expect(patch.onboarding_at).toBeTruthy();
  });

  it("clears onboarding_at when rolling back from passed offer to default offer sub-stage", () => {
    const prev = {
      current_job_stage_mapping_id: "mapping-offer",
      current_sub_state_id: "sub-offer-passed",
      offered_at: "2026-06-10T00:00:00Z",
      onboarding_at: "2026-06-10T01:00:00Z",
    };
    const update = {
      toStageMappingId: "mapping-offer",
      toSubStateId: "sub-offer-default",
    };
    const patch = buildNewPipelineCandidatePatch(prev, update, mockStageMappings, mockSubStages);
    expect(patch.offered_at).toBe("2026-06-10T00:00:00Z");
    expect(patch.onboarding_at).toBeNull();
  });
});

describe("legacyStatusForStageSubStage", () => {
  it("maps every seeded stage:sub-stage combination to its closest legacy status", () => {
    expect(legacyStatusForStageSubStage("cv_scan", "new")).toBe("New");
    expect(legacyStatusForStageSubStage("cv_scan", "consider")).toBe("Consider");
    expect(legacyStatusForStageSubStage("cv_scan", "passed")).toBe("CvPassed");
    expect(legacyStatusForStageSubStage("cv_scan", "failed")).toBe("CvFailed");
    expect(legacyStatusForStageSubStage("interview", "interview")).toBe("Interview");
    expect(legacyStatusForStageSubStage("interview", "consider")).toBe("InterviewConsider");
    expect(legacyStatusForStageSubStage("interview", "canceled")).toBe("InterviewCanceled");
    expect(legacyStatusForStageSubStage("interview", "passed")).toBe("InterviewPassed");
    expect(legacyStatusForStageSubStage("interview", "failed")).toBe("InterviewFailed");
    expect(legacyStatusForStageSubStage("offer", "offer")).toBe("Offer");
    expect(legacyStatusForStageSubStage("offer", "matched")).toBe("Matched");
    expect(legacyStatusForStageSubStage("offer", "rejected")).toBe("Rejected");
  });

  it("is case-insensitive", () => {
    expect(legacyStatusForStageSubStage("CV_SCAN", "New")).toBe("New");
    expect(legacyStatusForStageSubStage("Offer", "MATCHED")).toBe("Matched");
  });

  it("returns null for stage/sub-stage codes with no legacy analog", () => {
    expect(legacyStatusForStageSubStage("custom_stage", "custom_sub")).toBeNull();
    expect(legacyStatusForStageSubStage("offer", "on_hold")).toBeNull();
  });
});
