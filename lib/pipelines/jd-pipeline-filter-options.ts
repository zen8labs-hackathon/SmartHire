import type { CandidateStatus } from "@/lib/candidates/types";
import {
  legacyStatusForStageSubStage,
  type StageMapping,
  type SubStage,
} from "@/lib/pipelines/transition-validator";

/** One (stageMapping, subStage) pair the JD pipeline status filter can select. */
export type PipelineStageSubStageFilterOption = {
  /** Stable composite id: `${stageMapping.id}:${subStage.id}`. */
  id: string;
  stageMapping: StageMapping;
  subStage: SubStage;
  /** The matching legacy `CandidateStatus`, or null when this pair has no legacy analog. */
  legacyStatus: CandidateStatus | null;
};

/**
 * Builds one filter option per (stageMapping, subStage) pair, ordered by
 * `stageMapping.sequence_number` then `subStage.sequence_number`. Does not
 * include the "all" pseudo-option — callers render that separately.
 */
export function buildPipelineStageSubStageFilterOptions(
  stageMappings: StageMapping[],
  subStages: SubStage[],
): PipelineStageSubStageFilterOption[] {
  const options: PipelineStageSubStageFilterOption[] = [];
  const orderedStageMappings = [...stageMappings].sort(
    (a, b) => a.sequence_number - b.sequence_number,
  );
  for (const stageMapping of orderedStageMappings) {
    const orderedSubStages = subStages
      .filter((ss) => ss.pipeline_stage_id === stageMapping.pipeline_stage_id)
      .sort((a, b) => a.sequence_number - b.sequence_number);
    for (const subStage of orderedSubStages) {
      options.push({
        id: `${stageMapping.id}:${subStage.id}`,
        stageMapping,
        subStage,
        legacyStatus: legacyStatusForStageSubStage(
          stageMapping.pipeline_stages?.code ?? "",
          subStage.code,
        ),
      });
    }
  }
  return options;
}

/**
 * Counts how many of the given (already-resolved) `stageMappingId`s fall
 * under each stage mapping. Returns a count keyed by `stageMapping.id` for
 * every mapping in `stageMappings` (zero-filled), so callers can render one
 * stat card per stage regardless of whether any rows landed in it.
 */
export function countByStageMappingId(
  stageMappingIds: Array<string | null>,
  stageMappings: StageMapping[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const sm of stageMappings) counts[sm.id] = 0;
  for (const id of stageMappingIds) {
    if (id && id in counts) {
      counts[id] += 1;
    }
  }
  return counts;
}
