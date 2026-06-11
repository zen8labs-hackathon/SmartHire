-- Migration: Add pipeline_status column to candidates table to store stage:sub_stage codes
alter table public.candidates
  add column if not exists pipeline_status text;

-- Initialize pipeline_status for all existing candidates
update public.candidates c
set pipeline_status = ps.code || ':' || pss.code
from public.job_stage_mappings jsm
join public.pipeline_stages ps on jsm.pipeline_stage_id = ps.id
join public.pipeline_sub_stages pss on pss.pipeline_stage_id = ps.id
where c.current_job_stage_mapping_id = jsm.id
  and c.current_sub_state_id = pss.id;
