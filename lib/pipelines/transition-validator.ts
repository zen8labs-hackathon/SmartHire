import type { QueryExecutor } from "@/lib/db/config/client";
import {
  listJobStageMappings,
  listPipelineStages,
  listPipelineSubStagesForStages,
} from "@/lib/db/pipeline-stages";

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
 * Loads a job's stage mappings and their sub-stages, falling back to every
 * default pipeline stage when the job has no custom mappings of its own
 * (mirrors the old Supabase version's fallback). DB7X2K is a green-field
 * migration -- there's no legacy `candidates.status` data to reconcile, so
 * unlike the pre-migration version this has no error-shaped return; callers
 * let a DB error propagate like every other `lib/db` caller.
 */
export async function fetchJobPipelineConfig(
  db: QueryExecutor,
  jobId: string | null,
): Promise<{ stageMappings: StageMapping[]; subStages: SubStage[] }> {
  const allStages = await listPipelineStages(db);
  const stagesById = new Map(allStages.map((s) => [s.id, s]));

  let rawMappings: { id: string; sequence_number: number; pipeline_stage_id: string }[] =
    jobId ? await listJobStageMappings(db, jobId) : [];

  if (rawMappings.length === 0) {
    rawMappings = allStages.map((stage, idx) => ({
      id: stage.id,
      sequence_number: idx + 1,
      pipeline_stage_id: stage.id,
    }));
  }

  const stageMappings: StageMapping[] = rawMappings.map((m) => {
    const stage = stagesById.get(m.pipeline_stage_id) ?? null;
    return {
      id: m.id,
      sequence_number: m.sequence_number,
      pipeline_stage_id: m.pipeline_stage_id,
      pipeline_stages: stage,
    };
  });

  const subStageRows = await listPipelineSubStagesForStages(
    db,
    stageMappings.map((m) => m.pipeline_stage_id),
  );
  const subStages: SubStage[] = subStageRows.map((s) => ({
    id: s.id,
    pipeline_stage_id: s.pipeline_stage_id,
    code: s.code,
    label: s.label,
    sequence_number: s.sequence_number,
    is_default: s.is_default,
    is_passed: s.is_passed,
  }));

  return { stageMappings, subStages };
}

/**
 * Attempts to repair a candidate's stored (stageMappingId, subStateId) pair
 * when one or both no longer point at a live row. Two independent causes can
 * make an id stale:
 * - `stageMappingId` is soft-deleted by a JD pipeline edit (job_stage_mappings).
 * - `subStateId` is soft-deleted independently via Pipeline Manager
 *   (pipeline_sub_stages) — this never touches job_stage_mappings, so the
 *   stage mapping can remain perfectly live while the sub-stage is gone.
 *
 * Returns null when no live recovery target exists (candidate is genuinely
 * orphaned). Shared by `resolveCandidatePipelineIds` and
 * `wasCandidateStageOrphaned` so both stay in sync.
 */
function recoverLivePipelineIds(
  stageMappingId: string,
  subStateId: string,
  stageMappings: StageMapping[],
  subStages: SubStage[],
): { stageMappingId: string; subStateId: string } | null {
  const liveStageMapping = stageMappings.find((sm) => sm.id === stageMappingId);
  const isLiveSubStage = subStages.some((ss) => ss.id === subStateId);

  if (liveStageMapping && isLiveSubStage) {
    return { stageMappingId, subStateId };
  }

  if (liveStageMapping && !isLiveSubStage) {
    // The stage mapping is fine; only the sub-stage was soft-deleted. Recover
    // by falling back to that same stage's default sub-stage.
    const defaultSubStage = subStages.find(
      (ss) => ss.pipeline_stage_id === liveStageMapping.pipeline_stage_id && ss.is_default,
    );
    if (defaultSubStage) {
      return { stageMappingId, subStateId: defaultSubStage.id };
    }
    return null;
  }

  // The stored stageMappingId no longer points at an active row (e.g. it was
  // soft-deleted by a JD pipeline edit). Sub-stages are global and are never
  // touched by JD pipeline edits, so if the stored subStateId still resolves
  // to a live sub-stage, use its pipeline_stage_id to find the live mapping
  // for that same stage and recover the correct (non-stale) mapping id.
  const subStage = subStages.find((ss) => ss.id === subStateId);
  if (subStage) {
    const liveMapping = stageMappings.find(
      (sm) => sm.pipeline_stage_id === subStage.pipeline_stage_id,
    );
    if (liveMapping) {
      return { stageMappingId: liveMapping.id, subStateId };
    }
  }

  return null;
}

/**
 * Resolves an application's stage mapping ID and sub-stage ID, falling back
 * to the first stage's default sub-stage when unset or unrecoverable. No
 * legacy `status` fallback (green-field migration, see module doc comment).
 */
export function resolveCandidatePipelineIds(
  application: {
    current_job_stage_mapping_id?: string | null;
    current_sub_state_id?: string | null;
  },
  stageMappings: StageMapping[],
  subStages: SubStage[],
): { stageMappingId: string | null; subStateId: string | null } {
  const stageMappingId = application.current_job_stage_mapping_id ?? null;
  const subStateId = application.current_sub_state_id ?? null;

  if (stageMappingId && subStateId) {
    const recovered = recoverLivePipelineIds(stageMappingId, subStateId, stageMappings, subStages);
    if (recovered) {
      return recovered;
    }
  }

  if (stageMappings.length > 0) {
    const firstStageId = stageMappings[0].pipeline_stage_id;
    const defaultSubStage = subStages.find(
      (ss) => ss.pipeline_stage_id === firstStageId && ss.is_default,
    );
    return {
      stageMappingId: stageMappings[0].id,
      subStateId: defaultSubStage?.id ?? null,
    };
  }

  return { stageMappingId: null, subStateId: null };
}

/**
 * Read-only check: true if an application's stored `current_job_stage_mapping_id`
 * or `current_sub_state_id` no longer points to a live row AND cannot be
 * recovered (i.e. the stage/sub-stage was genuinely removed, not just
 * re-mapped to a new id). Used purely for display — does not affect
 * `resolveCandidatePipelineIds`'s resolution or any transition-validation
 * behavior.
 */
export function wasCandidateStageOrphaned(
  application: {
    current_job_stage_mapping_id?: string | null;
    current_sub_state_id?: string | null;
  },
  stageMappings: StageMapping[],
  subStages: SubStage[],
): boolean {
  const stageMappingId = application.current_job_stage_mapping_id ?? null;
  const subStateId = application.current_sub_state_id ?? null;

  if (!stageMappingId || !subStateId) {
    return false;
  }

  return recoverLivePipelineIds(stageMappingId, subStateId, stageMappings, subStages) === null;
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

export type PipelineTransitionPatch = {
  currentJobStageMappingId: string;
  currentSubStateId: string;
  /** ISO timestamp, only set on the transition that first earns it -- see {@link validateAndBuildPipelineTransition}'s doc comment. */
  hiredAt?: string;
};

export type PipelineTransitionResult =
  | { ok: true; patch: PipelineTransitionPatch }
  | { ok: false; error: string };

/**
 * The stage with the highest `sequence_number` in this job's pipeline --
 * "last" by position, never by code/name (a job's final stage might be
 * called anything under a fully custom pipeline). Returns `null` for an
 * empty list.
 */
function lastStageMapping(stageMappings: StageMapping[]): StageMapping | null {
  return stageMappings.reduce<StageMapping | null>(
    (max, sm) => (!max || sm.sequence_number > max.sequence_number ? sm : max),
    null,
  );
}

/**
 * Composes `resolveCandidatePipelineIds` + `isCustomTransitionAllowed` into
 * the single check both `PATCH /api/admin/candidates/[id]` and the bulk
 * `/api/admin/candidates/pipeline` route need: resolve the application's
 * current (recovering stale ids first), validate the requested move, and
 * return the patch to persist via `updateCampaignApplied`. Pure function —
 * no DB access here, callers own the read/write.
 *
 * Also implements the `hired_at` cache-column rule from DB7X2K's original
 * planning: set once, the first time the application enters the `is_passed`
 * sub-stage of the pipeline's *last* stage (by position). Requires the
 * caller to pass the application's current `hired_at` so this can stay a
 * pure function instead of re-fetching it -- omitted from the returned
 * patch (not just re-set to the same value) once it's already non-null, so
 * `updateCampaignApplied`'s `buildSetClause` leaves the column untouched on
 * every later transition (including a same-stage no-op PATCH, and a
 * rollback-then-forward-again re-entry).
 */
export function validateAndBuildPipelineTransition(
  current: {
    current_job_stage_mapping_id?: string | null;
    current_sub_state_id?: string | null;
    hired_at?: Date | string | null;
  },
  update: { toStageMappingId: string; toSubStateId: string },
  stageMappings: StageMapping[],
  subStages: SubStage[],
): PipelineTransitionResult {
  const { stageMappingId: fromStageMappingId, subStateId: fromSubStateId } =
    resolveCandidatePipelineIds(current, stageMappings, subStages);

  if (!fromStageMappingId || !fromSubStateId) {
    return { ok: false, error: "Could not resolve the application's current pipeline position." };
  }

  const targetMapping = stageMappings.find((sm) => sm.id === update.toStageMappingId);
  const targetSubStage = subStages.find((ss) => ss.id === update.toSubStateId);
  if (!targetMapping || !targetSubStage) {
    return { ok: false, error: "Target stage mapping or sub-stage not found." };
  }

  const allowed = isCustomTransitionAllowed(
    stageMappings,
    subStages,
    fromStageMappingId,
    fromSubStateId,
    update.toStageMappingId,
    update.toSubStateId,
  );
  if (!allowed) {
    return { ok: false, error: "Transition not allowed from the current stage." };
  }

  const patch: PipelineTransitionPatch = {
    currentJobStageMappingId: update.toStageMappingId,
    currentSubStateId: update.toSubStateId,
  };

  if (!current.hired_at) {
    const lastStage = lastStageMapping(stageMappings);
    if (lastStage && targetMapping.id === lastStage.id && targetSubStage.is_passed) {
      patch.hiredAt = new Date().toISOString();
    }
  }

  return { ok: true, patch };
}
