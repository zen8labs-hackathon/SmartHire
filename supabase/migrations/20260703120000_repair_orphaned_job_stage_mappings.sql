-- Repair candidates left pointing at soft-deleted job_stage_mappings rows.
--
-- Root cause: editing a JD's pipeline stages used to soft-delete ALL
-- job_stage_mappings rows for the job opening and re-insert brand new rows
-- (new UUIDs) for every stage, including unchanged ones. Candidates store
-- their position via candidates.current_job_stage_mapping_id, so any
-- candidate on a JD whose pipeline was edited before the write-path fix
-- (see app/api/admin/job-descriptions/[id]/route.ts +
-- lib/pipelines/upsert-job-stage-mappings.ts) ended up referencing a
-- soft-deleted row.
--
-- This migration re-points those candidates at the ACTIVE job_stage_mappings
-- row that shares the same (job_opening_id, pipeline_stage_id) pair as their
-- stale row — that pair is guaranteed unique among active rows by the
-- partial unique index job_stage_mappings_job_stage_idx. Candidates whose
-- stage was genuinely removed from the JD (no active replacement exists)
-- are left untouched, since there's nothing correct to repair them to.
--
-- Note: this does NOT attempt to repair the separate case where
-- current_job_stage_mapping_id was actually saved holding a pipeline_stage_id
-- (from the old "implicit default" fallback) — that's not reliably
-- distinguishable via SQL alone and is instead handled by the
-- resolveCandidatePipelineIds() read-path recovery logic.

update public.candidates c
set current_job_stage_mapping_id = replacement.id
from public.job_stage_mappings stale
join public.job_stage_mappings replacement
  on replacement.job_opening_id = stale.job_opening_id
  and replacement.pipeline_stage_id = stale.pipeline_stage_id
  and replacement.deleted_at is null
where c.current_job_stage_mapping_id = stale.id
  and stale.deleted_at is not null;
