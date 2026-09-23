import type { StageMapping, SubStage } from "@/lib/pipelines/transition-validator";

/** One (stageMapping, subStage) pair the JD pipeline status filter can select. */
export type PipelineStageSubStageFilterOption = {
  /** Stable composite id: `${stageMapping.id}:${subStage.id}`. */
  id: string;
  stageMapping: StageMapping;
  subStage: SubStage;
};

/** The "whole stage" filter option -- matches every sub-stage under `stageMapping`. */
export type PipelineStageOnlyFilterOption = {
  /** Stable id: the stage mapping's own id (no `:subStage` suffix). */
  id: string;
  stageMapping: StageMapping;
  subStage: null;
};

export type PipelineFilterOption =
  | PipelineStageOnlyFilterOption
  | PipelineStageSubStageFilterOption;

/**
 * Builds one "whole stage" option per stage mapping, followed by its
 * per-sub-stage options, ordered by `sequence_number`. Lets the JD pipeline
 * status filter match every candidate in a stage regardless of which
 * sub-stage they're currently on, in addition to the finer-grained
 * (stageMapping, subStage) options from
 * {@link buildPipelineStageSubStageFilterOptions}.
 */
export function buildPipelineFilterOptions(
  stageMappings: StageMapping[],
  subStages: SubStage[],
): PipelineFilterOption[] {
  const options: PipelineFilterOption[] = [];
  const orderedStageMappings = [...stageMappings].sort(
    (a, b) => a.sequence_number - b.sequence_number,
  );
  for (const stageMapping of orderedStageMappings) {
    options.push({ id: stageMapping.id, stageMapping, subStage: null });
    const orderedSubStages = subStages
      .filter((ss) => ss.pipeline_stage_id === stageMapping.pipeline_stage_id)
      .sort((a, b) => a.sequence_number - b.sequence_number);
    for (const subStage of orderedSubStages) {
      options.push({
        id: `${stageMapping.id}:${subStage.id}`,
        stageMapping,
        subStage,
      });
    }
  }
  return options;
}

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
