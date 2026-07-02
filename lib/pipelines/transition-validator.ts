import type { SupabaseClient } from "@supabase/supabase-js";
import type { CandidateDbRow } from "@/lib/candidates/db-row";
import type { CandidateStatus } from "@/lib/candidates/types";

export interface StageMapping {
  id: string;
  sequence_number: number;
  pipeline_stage_id: string;
  pipeline_stages: {
    id: string;
    code: string;
    label: string;
    desc: string | null;
    color: string | null;
  } | null;
}

export interface SubStage {
  id: string;
  pipeline_stage_id: string;
  code: string;
  label: string;
  sequence_number: number;
  is_default: boolean;
  is_passed: boolean;
}

/**
 * Loads job stages and sub-stages for a job opening
 */
export async function fetchJobPipelineConfig(
  supabase: SupabaseClient,
  jobOpeningId: string | null,
) {
  let stageMappings: StageMapping[] = [];

  // 1. Fetch stage mappings (only possible when a job opening is linked)
  if (jobOpeningId) {
    const { data: stageMappingsData, error: smError } = await supabase
      .from("job_stage_mappings")
      .select(`
        id,
        sequence_number,
        pipeline_stage_id,
        pipeline_stages!inner (
          id,
          code,
          label,
          desc,
          color
        )
      `)
      .eq("job_opening_id", jobOpeningId)
      .is("deleted_at", null)
      .order("sequence_number", { ascending: true });

    if (smError) {
      return { stageMappings: [], subStages: [], error: smError.message };
    }

    stageMappings = (stageMappingsData || []) as unknown as StageMapping[];
  }

  if (stageMappings.length === 0) {
    const { data: defaultStages, error: defError } = await supabase
      .from("pipeline_stages")
      .select("id, code, label, desc, color")
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (defError) {
      return { stageMappings: [], subStages: [], error: defError.message };
    }

    if (defaultStages) {
      stageMappings = defaultStages.map((stage, idx) => ({
        id: stage.id,
        sequence_number: idx + 1,
        pipeline_stage_id: stage.id,
        pipeline_stages: stage,
      }));
    }
  }
  const stageIds = stageMappings.map((sm) => sm.pipeline_stage_id);

  // 2. Fetch sub stages
  const { data: subStagesData, error: ssError } = await supabase
    .from("pipeline_sub_stages")
    .select("id, pipeline_stage_id, code, label, sequence_number, is_default, is_passed")
    .in("pipeline_stage_id", stageIds)
    .is("deleted_at", null)
    .order("sequence_number", { ascending: true });

  if (ssError || !subStagesData) {
    return { stageMappings, subStages: [], error: ssError?.message ?? "No sub-stages found" };
  }

  const subStages = subStagesData as unknown as SubStage[];
  return { stageMappings, subStages, error: null };
}

const LEGACY_STATUS_TO_STAGE_SUB_STAGE: Record<string, { stage: string; sub: string }> = {
  new: { stage: "cv_scan", sub: "new" },
  consider: { stage: "cv_scan", sub: "consider" },
  cvpassed: { stage: "cv_scan", sub: "passed" },
  shortlisted: { stage: "cv_scan", sub: "passed" },
  cvfailed: { stage: "cv_scan", sub: "failed" },
  failed: { stage: "cv_scan", sub: "failed" },
  interview: { stage: "interview", sub: "interview" },
  interviewing: { stage: "interview", sub: "interview" },
  interviewconsider: { stage: "interview", sub: "consider" },
  interviewcanceled: { stage: "interview", sub: "canceled" },
  interviewpassed: { stage: "interview", sub: "passed" },
  interviewfailed: { stage: "interview", sub: "failed" },
  offer: { stage: "offer", sub: "offer" },
  matched: { stage: "offer", sub: "matched" },
  rejected: { stage: "offer", sub: "rejected" },
};

/**
 * Inverse of LEGACY_STATUS_TO_STAGE_SUB_STAGE: maps a `${stageCode}:${subStageCode}`
 * key (both lowercased) to the closest legacy `candidates.status` enum value.
 * Used to dual-write the legacy `status` column whenever the new pipeline
 * columns are updated, so consumers that still read `status` directly
 * (status-counts API, evaluation client, timeline API, duplicate-check API, etc.)
 * don't go stale.
 */
const STAGE_SUB_STAGE_TO_LEGACY_STATUS: Record<string, CandidateStatus> = {
  "cv_scan:new": "New",
  "cv_scan:consider": "Consider",
  "cv_scan:passed": "CvPassed",
  "cv_scan:failed": "CvFailed",
  "interview:interview": "Interview",
  "interview:consider": "InterviewConsider",
  "interview:canceled": "InterviewCanceled",
  "interview:passed": "InterviewPassed",
  "interview:failed": "InterviewFailed",
  "offer:offer": "Offer",
  "offer:matched": "Matched",
  "offer:rejected": "Rejected",
};

/**
 * Resolves the closest legacy `candidates.status` enum value for a given
 * stage code + sub-stage code pair (case-insensitive). Returns null when no
 * mapping exists (e.g. fully custom stages/sub-stages with no legacy analog).
 */
export function legacyStatusForStageSubStage(
  stageCode: string,
  subStageCode: string,
): CandidateStatus | null {
  return (
    STAGE_SUB_STAGE_TO_LEGACY_STATUS[
      `${stageCode.toLowerCase()}:${subStageCode.toLowerCase()}`
    ] ?? null
  );
}

/**
 * Resolves a candidate's stage mapping ID and sub-stage ID, falling back to the first stage default if null.
 */
export function resolveCandidatePipelineIds(
  candidate: {
    current_job_stage_mapping_id?: string | null;
    current_sub_state_id?: string | null;
    status?: string | null;
  },
  stageMappings: StageMapping[],
  subStages: SubStage[],
): { stageMappingId: string | null; subStateId: string | null } {
  let stageMappingId = candidate.current_job_stage_mapping_id ?? null;
  let subStateId = candidate.current_sub_state_id ?? null;

  if (stageMappingId && subStateId) {
    return { stageMappingId, subStateId };
  }

  // Fallback to legacy status mapping if mapping/substate are missing
  if (candidate.status) {
    const canonicalStatus = candidate.status.trim().toLowerCase();
    const mapped = LEGACY_STATUS_TO_STAGE_SUB_STAGE[canonicalStatus];
    if (mapped) {
      const mapping = stageMappings.find(
        (sm) => (sm.pipeline_stages?.code ?? "").toLowerCase() === mapped.stage
      );
      if (mapping) {
        const subStage = subStages.find(
          (ss) =>
            ss.pipeline_stage_id === mapping.pipeline_stage_id &&
            ss.code.toLowerCase() === mapped.sub
        );
        if (subStage) {
          return { stageMappingId: mapping.id, subStateId: subStage.id };
        }
      }
    }
  }

  // If still not resolved, fall back to first stage default sub-stage
  if (stageMappings.length > 0) {
    stageMappingId = stageMappings[0].id;
    const firstStageId = stageMappings[0].pipeline_stage_id;
    const defaultSubStage = subStages.find(
      (ss) => ss.pipeline_stage_id === firstStageId && ss.is_default
    );
    if (defaultSubStage) {
      subStateId = defaultSubStage.id;
    }
  }

  return { stageMappingId, subStateId };
}

/**
 * Validates the custom transition flow rule:
 * - Within the same stage: always allowed.
 * - Move to next stage (forward consecutive): allowed only if from_sub_stage is passed and to_sub_stage is default.
 * - Rollback to previous stage (backward consecutive): allowed only if from_sub_stage is default and to_sub_stage is passed.
 * - Any other cross-stage move is blocked.
 */
export function isCustomTransitionAllowed(
  stageMappings: StageMapping[],
  subStages: SubStage[],
  fromStageMappingId: string,
  fromSubStateId: string,
  toStageMappingId: string,
  toSubStateId: string,
): boolean {
  if (fromStageMappingId === toStageMappingId) {
    // Within the same stage: always allowed
    return true;
  }

  const fromIndex = stageMappings.findIndex((sm) => sm.id === fromStageMappingId);
  const toIndex = stageMappings.findIndex((sm) => sm.id === toStageMappingId);

  if (fromIndex === -1 || toIndex === -1) {
    return false;
  }

  const fromSubStage = subStages.find((ss) => ss.id === fromSubStateId);
  const toSubStage = subStages.find((ss) => ss.id === toSubStateId);

  if (!fromSubStage || !toSubStage) {
    return false;
  }

  // Consecutive Forward: Stage i -> Stage i+1
  if (toIndex === fromIndex + 1) {
    return fromSubStage.is_passed && toSubStage.is_default;
  }

  // Consecutive Backward: Stage i -> Stage i-1
  if (toIndex === fromIndex - 1) {
    return fromSubStage.is_default && toSubStage.is_passed;
  }

  return false;
}

/**
 * Constructs the database update object for a candidate when transitioning.
 * Also dual-writes the closest legacy `status` enum value (see
 * `legacyStatusForStageSubStage`) in the same patch object so the update
 * remains a single atomic DB write and consumers still reading `status`
 * directly don't go stale.
 */
export function buildNewPipelineCandidatePatch(
  prev: {
    current_job_stage_mapping_id?: string | null;
    current_sub_state_id?: string | null;
    interview_at?: string | null;
    onboarding_at?: string | null;
    offered_at?: string | null;
  },
  update: {
    toStageMappingId: string;
    toSubStateId: string;
    interview_at?: string | null;
    onboarding_at?: string | null;
  },
  stageMappings: StageMapping[],
  subStages: SubStage[],
): Record<string, any> {
  const { stageMappingId: fromStageMappingId } = resolveCandidatePipelineIds(prev, stageMappings, subStages);

  const fromIndex = stageMappings.findIndex((sm) => sm.id === fromStageMappingId);
  const toIndex = stageMappings.findIndex((sm) => sm.id === update.toStageMappingId);

  const targetMapping = stageMappings[toIndex];
  const targetSubStage = subStages.find((ss) => ss.id === update.toSubStateId);
  
  if (!targetMapping || !targetSubStage) {
    throw new Error("Target stage mapping or sub-stage not found.");
  }

  const stageCode = (targetMapping.pipeline_stages?.code ?? "").toLowerCase();
  const subStageCode = targetSubStage.code.toLowerCase();

  const patch: Record<string, any> = {
    current_job_stage_mapping_id: update.toStageMappingId,
    current_sub_state_id: update.toSubStateId,
    pipeline_status: `${stageCode}:${subStageCode}`,
  };

  const legacyStatus = legacyStatusForStageSubStage(stageCode, subStageCode);
  if (legacyStatus) {
    patch.status = legacyStatus;
  }

  // Date management:
  let interview_at = prev.interview_at ?? null;
  let onboarding_at = prev.onboarding_at ?? null;
  let offered_at = prev.offered_at ?? null;

  const currTime = new Date().toISOString();

  const interviewStageIndex = stageMappings.findIndex(
    (sm) => (sm.pipeline_stages?.code ?? "").toLowerCase() === "interview"
  );
  const offerStageIndex = stageMappings.findIndex(
    (sm) => (sm.pipeline_stages?.code ?? "").toLowerCase() === "offer"
  );

  // If rolling back to previous stages, clear dates of higher stages dynamically
  if (toIndex < fromIndex) {
    if (offerStageIndex !== -1 && toIndex < offerStageIndex) {
      onboarding_at = null;
      offered_at = null;
    }
    if (interviewStageIndex !== -1 && toIndex < interviewStageIndex) {
      interview_at = null;
    }
  } else {
    // Moving forward or staying in same stage -> auto initialize dates if needed
    if (stageCode === "interview" && !interview_at) {
      interview_at = update.interview_at !== undefined ? update.interview_at : currTime;
    }
    if (stageCode === "offer") {
      if (targetSubStage.is_passed) {
        if (!onboarding_at) {
          onboarding_at = update.onboarding_at !== undefined ? update.onboarding_at : currTime;
        }
      } else {
        onboarding_at = null;
      }
      if (!offered_at) {
        offered_at = currTime;
      }
    }
  }

  // Respect explicitly passed values
  if (update.interview_at !== undefined) patch.interview_at = update.interview_at;
  else patch.interview_at = interview_at;

  if (update.onboarding_at !== undefined) patch.onboarding_at = update.onboarding_at;
  else patch.onboarding_at = onboarding_at;

  patch.offered_at = offered_at;

  return patch;
}
