-- Wrap the job_stage_mappings reconciliation (used when a JD's pipeline
-- stages are edited) in a single Postgres function so it runs as one
-- transaction. Previously lib/pipelines/upsert-job-stage-mappings.ts issued
-- separate soft-delete/update/insert calls from the app; a failure partway
-- through (e.g. a duplicate stage id violating job_stage_mappings_job_stage_idx
-- on insert) could leave stale rows soft-deleted with no replacement,
-- orphaning candidates.current_job_stage_mapping_id — the exact bug class
-- this module exists to prevent (see 20260703120000_repair_orphaned_job_stage_mappings.sql).
--
-- p_stage_ids is deduplicated by first occurrence before use, since a
-- duplicate id reaching the insert step would otherwise violate the partial
-- unique index and abort the whole write.
create or replace function public.upsert_job_stage_mappings(
  p_job_opening_id uuid,
  p_stage_ids uuid[]
)
returns void
language plpgsql
security invoker
as $$
declare
  v_stage_ids uuid[];
begin
  select coalesce(array_agg(stage_id order by first_ord), '{}')
  into v_stage_ids
  from (
    select stage_id, min(ord) as first_ord
    from unnest(p_stage_ids) with ordinality as t(stage_id, ord)
    group by stage_id
  ) deduped;

  -- Soft-delete active mappings for stages no longer in the new list.
  update public.job_stage_mappings m
  set deleted_at = now()
  where m.job_opening_id = p_job_opening_id
    and m.deleted_at is null
    and not (m.pipeline_stage_id = any (v_stage_ids));

  -- Update sequence_number in place for stages that remain active
  -- (their id, and therefore any candidates.current_job_stage_mapping_id
  -- reference, is never touched).
  update public.job_stage_mappings m
  set sequence_number = s.seq
  from unnest(v_stage_ids) with ordinality as s(stage_id, seq)
  where m.job_opening_id = p_job_opening_id
    and m.deleted_at is null
    and m.pipeline_stage_id = s.stage_id;

  -- Insert stages that have no active mapping yet.
  insert into public.job_stage_mappings (job_opening_id, pipeline_stage_id, sequence_number)
  select p_job_opening_id, s.stage_id, s.seq
  from unnest(v_stage_ids) with ordinality as s(stage_id, seq)
  where not exists (
    select 1
    from public.job_stage_mappings m
    where m.job_opening_id = p_job_opening_id
      and m.deleted_at is null
      and m.pipeline_stage_id = s.stage_id
  );
end;
$$;

grant execute on function public.upsert_job_stage_mappings(uuid, uuid[]) to authenticated;
