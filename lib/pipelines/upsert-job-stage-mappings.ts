import type { SupabaseClient } from "@supabase/supabase-js";

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
 * - Duplicate ids in `pipelineStages` are deduplicated (first occurrence wins).
 *
 * The reconciliation runs inside the `upsert_job_stage_mappings` Postgres
 * function (see migration `20260706120000_atomic_upsert_job_stage_mappings_fn.sql`)
 * so the soft-delete/update/insert steps commit as a single transaction —
 * a failure partway through can no longer leave stale mappings soft-deleted
 * with no replacement inserted.
 */
export async function upsertJobStageMappings(
  supabase: SupabaseClient,
  jobOpeningId: string,
  pipelineStages: string[] | null | undefined,
): Promise<UpsertJobStageMappingsResult> {
  const { error } = await supabase.rpc("upsert_job_stage_mappings", {
    p_job_opening_id: jobOpeningId,
    p_stage_ids: pipelineStages ?? [],
  });

  if (error) {
    return { error: `Failed to reconcile stage mappings: ${error.message}` };
  }

  return { error: null };
}
