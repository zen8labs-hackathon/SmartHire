-- Seed stages/sub-stages, map to existing job openings, and initialize existing candidates data.

-- 1. Seed standard master stages
insert into public.pipeline_stages (code, label, "desc") values
  ('cv_scan', 'CV Scan', 'Initial CV screening phase'),
  ('interview', 'Interview', 'Interview and evaluation phase'),
  ('offer', 'Offer', 'Offer and contract phase')
on conflict do nothing;

-- 2. Seed standard sub-stages with is_default and is_passed markers
-- CV Scan
insert into public.pipeline_sub_stages (pipeline_stage_id, code, label, sequence_number, is_default, is_passed)
select id, 'new', 'New', 1, true, false from public.pipeline_stages where code = 'cv_scan' on conflict do nothing;
insert into public.pipeline_sub_stages (pipeline_stage_id, code, label, sequence_number, is_default, is_passed)
select id, 'passed', 'Passed', 2, false, true from public.pipeline_stages where code = 'cv_scan' on conflict do nothing;
insert into public.pipeline_sub_stages (pipeline_stage_id, code, label, sequence_number, is_default, is_passed)
select id, 'failed', 'Failed', 3, false, false from public.pipeline_stages where code = 'cv_scan' on conflict do nothing;
insert into public.pipeline_sub_stages (pipeline_stage_id, code, label, sequence_number, is_default, is_passed)
select id, 'consider', 'Consider', 4, false, false from public.pipeline_stages where code = 'cv_scan' on conflict do nothing;

-- Interview
insert into public.pipeline_sub_stages (pipeline_stage_id, code, label, sequence_number, is_default, is_passed)
select id, 'interview', 'Interview', 1, true, false from public.pipeline_stages where code = 'interview' on conflict do nothing;
insert into public.pipeline_sub_stages (pipeline_stage_id, code, label, sequence_number, is_default, is_passed)
select id, 'consider', 'Consider', 2, false, false from public.pipeline_stages where code = 'interview' on conflict do nothing;
insert into public.pipeline_sub_stages (pipeline_stage_id, code, label, sequence_number, is_default, is_passed)
select id, 'canceled', 'Canceled', 3, false, false from public.pipeline_stages where code = 'interview' on conflict do nothing;
insert into public.pipeline_sub_stages (pipeline_stage_id, code, label, sequence_number, is_default, is_passed)
select id, 'passed', 'Passed', 4, false, true from public.pipeline_stages where code = 'interview' on conflict do nothing;
insert into public.pipeline_sub_stages (pipeline_stage_id, code, label, sequence_number, is_default, is_passed)
select id, 'failed', 'Failed', 5, false, false from public.pipeline_stages where code = 'interview' on conflict do nothing;

-- Offer
insert into public.pipeline_sub_stages (pipeline_stage_id, code, label, sequence_number, is_default, is_passed)
select id, 'offer', 'Offer', 1, true, false from public.pipeline_stages where code = 'offer' on conflict do nothing;
insert into public.pipeline_sub_stages (pipeline_stage_id, code, label, sequence_number, is_default, is_passed)
select id, 'matched', 'Matched', 2, false, true from public.pipeline_stages where code = 'offer' on conflict do nothing;
insert into public.pipeline_sub_stages (pipeline_stage_id, code, label, sequence_number, is_default, is_passed)
select id, 'rejected', 'Rejected', 3, false, false from public.pipeline_stages where code = 'offer' on conflict do nothing;

-- 3. Create mappings for all existing jobs
insert into public.job_stage_mappings (job_opening_id, pipeline_stage_id, sequence_number)
select jo.id, ps.id, 
       case ps.code 
         when 'cv_scan' then 1 
         when 'interview' then 2 
         when 'offer' then 3 
       end
from public.job_openings jo
cross join public.pipeline_stages ps
on conflict do nothing;

-- 4. Initial one-time sync of current candidates to initialize the parallel feature fields
update public.candidates c
set 
  current_job_stage_mapping_id = jsm.id,
  current_sub_state_id = pss.id
from public.job_stage_mappings jsm
join public.pipeline_stages ps on jsm.pipeline_stage_id = ps.id
join public.pipeline_sub_stages pss on pss.pipeline_stage_id = ps.id
where c.job_opening_id = jsm.job_opening_id
  and (
    (c.status = 'New' and ps.code = 'cv_scan' and pss.code = 'new') or
    (c.status = 'CvPassed' and ps.code = 'cv_scan' and pss.code = 'passed') or
    (c.status = 'CvFailed' and ps.code = 'cv_scan' and pss.code = 'failed') or
    (c.status = 'Consider' and ps.code = 'cv_scan' and pss.code = 'consider') or
    (c.status = 'Interview' and ps.code = 'interview' and pss.code = 'interview') or
    (c.status = 'InterviewConsider' and ps.code = 'interview' and pss.code = 'consider') or
    (c.status = 'InterviewCanceled' and ps.code = 'interview' and pss.code = 'canceled') or
    (c.status = 'InterviewPassed' and ps.code = 'interview' and pss.code = 'passed') or
    (c.status = 'InterviewFailed' and ps.code = 'interview' and pss.code = 'failed') or
    (c.status = 'Offer' and ps.code = 'offer' and pss.code = 'offer') or
    (c.status = 'Matched' and ps.code = 'offer' and pss.code = 'matched') or
    (c.status = 'Rejected' and ps.code = 'offer' and pss.code = 'rejected')
  );
