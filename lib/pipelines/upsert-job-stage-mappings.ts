import type { SupabaseClient } from "@supabase/supabase-js";

interface ActiveJobStageMapping {
  id: string;
  pipeline_stage_id: string;
  sequence_number: number;
}

export interface UpsertJobStageMappingsResult {
  error: string | null;
}

/**
 * Reconciles a job opening's `job_stage_mappings` rows with a new ordered list
 * of pipeline stage ids, preserving the `id` (and therefore
 * `candidates.current_job_stage_mapping_id` references) of stages that remain
 * in the list.
 *
 * - Stages already active and present in `pipelineStages` are updated in place
 *   (only `sequence_number` changes) — their `id` is never touched.
 * - Stages newly added to `pipelineStages` are inserted.
 * - Active stages no longer present in `pipelineStages` are soft-deleted.
 * - A `null`/empty `pipelineStages` soft-deletes every active mapping.
 *
 * Note: `.upsert()` with `onConflict` is intentionally NOT used here —
 * `job_stage_mappings_job_stage_idx` is a partial unique index
 * (`(job_opening_id, pipeline_stage_id) WHERE deleted_at IS NULL`), which
 * Postgres cannot match against a plain `ON CONFLICT` target.
 */
export async function upsertJobStageMappings(
  supabase: SupabaseClient,
  jobOpeningId: string,
  pipelineStages: string[] | null | undefined,
): Promise<UpsertJobStageMappingsResult> {
  const { data: activeMappingsData, error: fetchErr } = await supabase
    .from("job_stage_mappings")
    .select("id, pipeline_stage_id, sequence_number")
    .eq("job_opening_id", jobOpeningId)
    .is("deleted_at", null);

  if (fetchErr) {
    return {
      error: `Failed to load existing stage mappings: ${fetchErr.message}`,
    };
  }

  const activeMappings = (activeMappingsData ?? []) as ActiveJobStageMapping[];
  const activeByStageId = new Map(
    activeMappings.map((m) => [m.pipeline_stage_id, m] as const),
  );

  const newStageIds = pipelineStages && pipelineStages.length > 0 ? pipelineStages : [];
  const newStageIdSet = new Set(newStageIds);

  const staleIds = activeMappings
    .filter((m) => !newStageIdSet.has(m.pipeline_stage_id))
    .map((m) => m.id);

  if (staleIds.length > 0) {
    const { error: delErr } = await supabase
      .from("job_stage_mappings")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", staleIds);

    if (delErr) {
      return {
        error: `Failed to remove stale stage mappings: ${delErr.message}`,
      };
    }
  }

  const toInsert: {
    job_opening_id: string;
    pipeline_stage_id: string;
    sequence_number: number;
  }[] = [];

  for (let idx = 0; idx < newStageIds.length; idx++) {
    const stageId = newStageIds[idx];
    const sequenceNumber = idx + 1;
    const existingMapping = activeByStageId.get(stageId);

    if (existingMapping) {
      const { error: updErr } = await supabase
        .from("job_stage_mappings")
        .update({ sequence_number: sequenceNumber })
        .eq("id", existingMapping.id);

      if (updErr) {
        return {
          error: `Failed to update stage mapping sequence: ${updErr.message}`,
        };
      }
    } else {
      toInsert.push({
        job_opening_id: jobOpeningId,
        pipeline_stage_id: stageId,
        sequence_number: sequenceNumber,
      });
    }
  }

  if (toInsert.length > 0) {
    const { error: insErr } = await supabase
      .from("job_stage_mappings")
      .insert(toInsert);

    if (insErr) {
      return { error: `Failed to insert stage mappings: ${insErr.message}` };
    }
  }

  return { error: null };
}
