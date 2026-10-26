import { describe, expect, it, vi } from "vitest";
import {
  fetchJobPipelineConfig,
  isCustomTransitionAllowed,
  isSchedulingEnabled,
  resolveCandidatePipelineIds,
  validateAndBuildPipelineTransition,
  wasCandidateStageOrphaned,
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
      allow_schedule: false,
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
      allow_schedule: true,
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
      allow_schedule: false,
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
    is_terminal: false,
    is_withdraw: false,
  },
  {
    id: "sub-cv-passed",
    pipeline_stage_id: "stage-cv-scan",
    code: "passed",
    label: "Passed",
    sequence_number: 2,
    is_default: false,
    is_passed: true,
    is_terminal: false,
    is_withdraw: false,
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
    is_terminal: false,
    is_withdraw: false,
  },
  {
    id: "sub-int-passed",
    pipeline_stage_id: "stage-interview",
    code: "passed",
    label: "Passed",
    sequence_number: 2,
    is_default: false,
    is_passed: true,
    is_terminal: false,
    is_withdraw: false,
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
    is_terminal: false,
    is_withdraw: false,
  },
  {
    id: "sub-offer-passed",
    pipeline_stage_id: "stage-offer",
    code: "passed",
    label: "Passed",
    sequence_number: 2,
    is_default: false,
    is_passed: true,
    is_terminal: false,
    is_withdraw: false,
  },
];

describe("resolveCandidatePipelineIds", () => {
  it("uses existing IDs if present", () => {
    // Ids must be "live" (i.e. present in stageMappings) to be trusted as-is;
    // see the "recovers stage mapping id via sub-state" test below for the
    // stale-id case.
    const application = {
      current_job_stage_mapping_id: "mapping-interview",
      current_sub_state_id: "sub-int-interview",
    };
    const result = resolveCandidatePipelineIds(application, mockStageMappings, mockSubStages);
    expect(result.stageMappingId).toBe("mapping-interview");
    expect(result.subStateId).toBe("sub-int-interview");
  });

  it("falls back to first stage default sub-stage if IDs are null", () => {
    const application = {
      current_job_stage_mapping_id: null,
      current_sub_state_id: null,
    };
    const result = resolveCandidatePipelineIds(application, mockStageMappings, mockSubStages);
    expect(result.stageMappingId).toBe("mapping-cv-scan");
    expect(result.subStateId).toBe("sub-cv-new");
  });

  it("recovers stage mapping id via sub-state when stored stageMappingId is stale", () => {
    const application = {
      current_job_stage_mapping_id: "stale-mapping-id-not-in-list",
      current_sub_state_id: "sub-int-interview",
    };
    const result = resolveCandidatePipelineIds(application, mockStageMappings, mockSubStages);
    expect(result.stageMappingId).toBe("mapping-interview");
    expect(result.stageMappingId).not.toBe("stale-mapping-id-not-in-list");
    expect(result.subStateId).toBe("sub-int-interview");
  });

  it("falls back to first-stage default when both ids are stale/unresolvable", () => {
    const application = {
      current_job_stage_mapping_id: "stale-mapping-id",
      current_sub_state_id: "stale-sub-state-id",
    };
    const result = resolveCandidatePipelineIds(application, mockStageMappings, mockSubStages);
    expect(result.stageMappingId).toBe("mapping-cv-scan");
    expect(result.subStateId).toBe("sub-cv-new");
  });

  it("recovers to the stage's default sub-stage when only the sub-stage was soft-deleted", () => {
    // stageMappingId is live but subStateId was deleted independently via
    // Pipeline Manager (e.g. sub-stage delete), which never touches
    // job_stage_mappings.
    const application = {
      current_job_stage_mapping_id: "mapping-interview",
      current_sub_state_id: "deleted-sub-state-id",
    };
    const result = resolveCandidatePipelineIds(application, mockStageMappings, mockSubStages);
    expect(result.stageMappingId).toBe("mapping-interview");
    expect(result.subStateId).toBe("sub-int-interview");
  });

  it("returns nulls when there are no stage mappings at all", () => {
    const application = {
      current_job_stage_mapping_id: null,
      current_sub_state_id: null,
    };
    const result = resolveCandidatePipelineIds(application, [], []);
    expect(result.stageMappingId).toBeNull();
    expect(result.subStateId).toBeNull();
  });
});

describe("wasCandidateStageOrphaned", () => {
  it("returns false when ids are both null (never assigned)", () => {
    const application = {
      current_job_stage_mapping_id: null,
      current_sub_state_id: null,
    };
    expect(wasCandidateStageOrphaned(application, mockStageMappings, mockSubStages)).toBe(false);
  });

  it("returns false when the stored stageMappingId is live", () => {
    const application = {
      current_job_stage_mapping_id: "mapping-interview",
      current_sub_state_id: "sub-int-interview",
    };
    expect(wasCandidateStageOrphaned(application, mockStageMappings, mockSubStages)).toBe(false);
  });

  it("returns false when stale but recoverable via sub-state's pipeline_stage_id", () => {
    const application = {
      current_job_stage_mapping_id: "stale-mapping-id-not-in-list",
      current_sub_state_id: "sub-int-interview",
    };
    expect(wasCandidateStageOrphaned(application, mockStageMappings, mockSubStages)).toBe(false);
  });

  it("returns true when stale and not recoverable (stage genuinely removed)", () => {
    const application = {
      current_job_stage_mapping_id: "stale-mapping-id",
      current_sub_state_id: "stale-sub-state-id",
    };
    expect(wasCandidateStageOrphaned(application, mockStageMappings, mockSubStages)).toBe(true);
  });

  it("returns false when only the sub-stage was soft-deleted but the stage has a default to recover to", () => {
    const application = {
      current_job_stage_mapping_id: "mapping-interview",
      current_sub_state_id: "deleted-sub-state-id",
    };
    expect(wasCandidateStageOrphaned(application, mockStageMappings, mockSubStages)).toBe(false);
  });

  it("returns true when the sub-stage was soft-deleted and its stage has no default sub-stage to recover to", () => {
    const stageMappingsNoDefault: StageMapping[] = [
      {
        id: "mapping-no-default",
        sequence_number: 1,
        pipeline_stage_id: "stage-no-default",
        pipeline_stages: {
          id: "stage-no-default",
          code: "custom",
          label: "Custom",
          desc: null,
          color: null,
          allow_schedule: false,
        },
      },
    ];
    const subStagesNoDefault: SubStage[] = [
      {
        id: "sub-no-default-only",
        pipeline_stage_id: "stage-no-default",
        code: "only",
        label: "Only",
        sequence_number: 1,
        is_default: false,
        is_passed: false,
        is_terminal: false,
        is_withdraw: false,
      },
    ];
    const application = {
      current_job_stage_mapping_id: "mapping-no-default",
      current_sub_state_id: "deleted-sub-state-id",
    };
    expect(
      wasCandidateStageOrphaned(application, stageMappingsNoDefault, subStagesNoDefault),
    ).toBe(true);
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

describe("validateAndBuildPipelineTransition", () => {
  it("builds the patch for an allowed forward transition", () => {
    const current = {
      current_job_stage_mapping_id: "mapping-cv-scan",
      current_sub_state_id: "sub-cv-passed",
    };
    const result = validateAndBuildPipelineTransition(
      current,
      { toStageMappingId: "mapping-interview", toSubStateId: "sub-int-interview" },
      mockStageMappings,
      mockSubStages,
    );
    expect(result).toEqual({
      ok: true,
      patch: {
        currentJobStageMappingId: "mapping-interview",
        currentSubStateId: "sub-int-interview",
      },
    });
  });

  it("rejects a disallowed transition", () => {
    const current = {
      current_job_stage_mapping_id: "mapping-cv-scan",
      current_sub_state_id: "sub-cv-new",
    };
    const result = validateAndBuildPipelineTransition(
      current,
      { toStageMappingId: "mapping-interview", toSubStateId: "sub-int-interview" },
      mockStageMappings,
      mockSubStages,
    );
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown target stage/sub-stage id", () => {
    const current = {
      current_job_stage_mapping_id: "mapping-cv-scan",
      current_sub_state_id: "sub-cv-passed",
    };
    const result = validateAndBuildPipelineTransition(
      current,
      { toStageMappingId: "unknown-mapping", toSubStateId: "sub-int-interview" },
      mockStageMappings,
      mockSubStages,
    );
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it("recovers a stale current position before validating", () => {
    const current = {
      current_job_stage_mapping_id: "stale-mapping-id",
      current_sub_state_id: "sub-cv-passed",
    };
    // recovers to mapping-cv-scan (via sub-state), then forward transition is allowed
    const result = validateAndBuildPipelineTransition(
      current,
      { toStageMappingId: "mapping-interview", toSubStateId: "sub-int-interview" },
      mockStageMappings,
      mockSubStages,
    );
    expect(result.ok).toBe(true);
  });

  describe("hired_at rule", () => {
    // Probation is identified by stage_type, not by code/label: the stage is
    // deliberately named "Onboarding" here.
    const probationMappings: StageMapping[] = [
      ...mockStageMappings,
      {
        id: "mapping-onboard",
        sequence_number: 4,
        pipeline_stage_id: "stage-onboard",
        pipeline_stages: {
          id: "stage-onboard",
          code: "onboarding",
          label: "Onboarding",
          desc: null,
          color: "green",
          allow_schedule: false,
          stage_type: "probation",
        },
      },
    ];
    const probationSubStages: SubStage[] = [
      ...mockSubStages,
      {
        id: "sub-onboard-awaiting",
        pipeline_stage_id: "stage-onboard",
        code: "awaiting_start",
        label: "Awaiting start",
        sequence_number: 1,
        is_default: true,
        is_passed: false,
        is_terminal: false,
        is_withdraw: false,
      },
    ];
    const fromOfferPassed = {
      current_job_stage_mapping_id: "mapping-offer",
      current_sub_state_id: "sub-offer-passed",
    };

    it("sets hiredAt when entering a probation-type stage (any sub-stage)", () => {
      const result = validateAndBuildPipelineTransition(
        { ...fromOfferPassed, hired_at: null },
        { toStageMappingId: "mapping-onboard", toSubStateId: "sub-onboard-awaiting" },
        probationMappings,
        probationSubStages,
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.patch.hiredAt).toEqual(expect.any(String));
        expect(Number.isNaN(Date.parse(result.patch.hiredAt!))).toBe(false);
      }
    });

    it("does not set hiredAt when hired_at is already set (no overwrite)", () => {
      const result = validateAndBuildPipelineTransition(
        { ...fromOfferPassed, hired_at: "2026-01-01T00:00:00Z" },
        { toStageMappingId: "mapping-onboard", toSubStateId: "sub-onboard-awaiting" },
        probationMappings,
        probationSubStages,
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.patch.hiredAt).toBeUndefined();
      }
    });

    it("does not set hiredAt on the passed sub-stage of a non-probation last stage", () => {
      const result = validateAndBuildPipelineTransition(
        {
          current_job_stage_mapping_id: "mapping-offer",
          current_sub_state_id: "sub-offer-default",
          hired_at: null,
        },
        { toStageMappingId: "mapping-offer", toSubStateId: "sub-offer-passed" },
        mockStageMappings,
        mockSubStages,
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.patch.hiredAt).toBeUndefined();
      }
    });

    it("does not treat a stage named/coded 'probation' without the type as hired", () => {
      const namedOnly = probationMappings.map((m) =>
        m.id === "mapping-onboard"
          ? {
              ...m,
              pipeline_stages: {
                ...m.pipeline_stages!,
                code: "probation",
                label: "Probation",
                stage_type: "none",
              },
            }
          : m,
      );
      const result = validateAndBuildPipelineTransition(
        { ...fromOfferPassed, hired_at: null },
        { toStageMappingId: "mapping-onboard", toSubStateId: "sub-onboard-awaiting" },
        namedOnly,
        probationSubStages,
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.patch.hiredAt).toBeUndefined();
      }
    });

    describe("legacyFlow (job.pipeline_id IS NULL)", () => {
      const fromOfferDefault = {
        current_job_stage_mapping_id: "mapping-offer",
        current_sub_state_id: "sub-offer-default",
        hired_at: null,
      };
      it("sets hiredAt on the passed sub-stage of the last stage", () => {
        const result = validateAndBuildPipelineTransition(
          fromOfferDefault,
          { toStageMappingId: "mapping-offer", toSubStateId: "sub-offer-passed" },
          mockStageMappings,
          mockSubStages,
          { legacyFlow: true },
        );
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.patch.hiredAt).toEqual(expect.any(String));
      });

      it("does not set hiredAt for a probation-type stage that is not last-passed", () => {
        const result = validateAndBuildPipelineTransition(
          { ...fromOfferPassed, hired_at: null },
          { toStageMappingId: "mapping-offer", toSubStateId: "sub-offer-default" },
          probationMappings.map((m) => ({ ...m, sequence_number: m.id === "mapping-onboard" ? 0 : m.sequence_number })),
          probationSubStages,
          { legacyFlow: true },
        );
        if (result.ok) expect(result.patch.hiredAt).toBeUndefined();
      });

      it("does not overwrite an existing hired_at", () => {
        const result = validateAndBuildPipelineTransition(
          { ...fromOfferDefault, hired_at: "2026-01-01T00:00:00Z" },
          { toStageMappingId: "mapping-offer", toSubStateId: "sub-offer-passed" },
          mockStageMappings,
          mockSubStages,
          { legacyFlow: true },
        );
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.patch.hiredAt).toBeUndefined();
      });
    });
  });
});

function fakeDb(queuedRows: unknown[][]) {
  const query = vi.fn();
  for (const rows of queuedRows) {
    query.mockResolvedValueOnce({ rows });
  }
  return { query };
}

describe("fetchJobPipelineConfig", () => {
  it("uses the job's own stage mappings when present", async () => {
    const allStages = [
      { id: "stage-cv-scan", code: "cv_scan", label: "CV Scan", desc: null, color: "sky" },
      { id: "stage-interview", code: "interview", label: "Interview", desc: null, color: "violet" },
    ];
    const jobMappings = [
      { id: "mapping-1", job_id: "job-1", pipeline_stage_id: "stage-cv-scan", sequence_number: 1 },
    ];
    const subStageRows = [
      {
        id: "sub-1",
        pipeline_stage_id: "stage-cv-scan",
        code: "new",
        label: "New",
        sequence_number: 1,
        is_default: true,
        is_passed: false,
        is_terminal: false,
        is_withdraw: false,
      },
    ];
    const db = fakeDb([allStages, jobMappings, subStageRows]);

    const { stageMappings, subStages } = await fetchJobPipelineConfig(db, "job-1");

    expect(stageMappings).toEqual([
      {
        id: "mapping-1",
        sequence_number: 1,
        pipeline_stage_id: "stage-cv-scan",
        pipeline_stages: allStages[0],
        schedule: null,
        sla_days: null,
      },
    ]);
    expect(subStages).toEqual([
      {
        id: "sub-1",
        pipeline_stage_id: "stage-cv-scan",
        code: "new",
        label: "New",
        sequence_number: 1,
        is_default: true,
        is_passed: false,
        is_terminal: false,
        is_withdraw: false,
      },
    ]);
  });

  it("falls back to every default pipeline stage when the job has no mappings", async () => {
    const allStages = [
      { id: "stage-cv-scan", code: "cv_scan", label: "CV Scan", desc: null, color: "sky" },
    ];
    const db = fakeDb([allStages, [], []]);

    const { stageMappings } = await fetchJobPipelineConfig(db, "job-1");

    expect(stageMappings).toEqual([
      {
        id: "stage-cv-scan",
        sequence_number: 1,
        pipeline_stage_id: "stage-cv-scan",
        pipeline_stages: allStages[0],
        schedule: null,
        sla_days: null,
      },
    ]);
  });

  it("falls back to default stages when jobId is null", async () => {
    const allStages = [
      { id: "stage-cv-scan", code: "cv_scan", label: "CV Scan", desc: null, color: "sky" },
    ];
    const db = fakeDb([allStages, []]);

    const { stageMappings } = await fetchJobPipelineConfig(db, null);

    expect(db.query).toHaveBeenCalledTimes(2);
    expect(stageMappings[0].pipeline_stage_id).toBe("stage-cv-scan");
  });
});

describe("isSchedulingEnabled", () => {
  it("uses the job-level flag when set", () => {
    expect(isSchedulingEnabled({ schedule: false }, { allow_schedule: true })).toBe(false);
    expect(isSchedulingEnabled({ schedule: true }, { allow_schedule: false })).toBe(true);
  });

  it("falls back to the stage default when the job flag is null", () => {
    expect(isSchedulingEnabled({ schedule: null }, { allow_schedule: true })).toBe(true);
    expect(isSchedulingEnabled({}, { allow_schedule: false })).toBe(false);
  });

  it("is off without a mapping or any flag", () => {
    expect(isSchedulingEnabled(null, { allow_schedule: true })).toBe(false);
    expect(isSchedulingEnabled({ schedule: null }, null)).toBe(false);
  });
});
