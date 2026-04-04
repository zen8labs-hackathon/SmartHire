-- Per (job description, pipeline candidate): notes / questions before the interview.

create table if not exists public.pipeline_candidate_pre_interview_notes (
  job_description_id bigint not null
    references public.job_descriptions (id) on delete cascade,
  pipeline_candidate_id uuid not null,
  pre_interview_note text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint pipeline_candidate_pre_interview_notes_note_len
    check (char_length(pre_interview_note) <= 32000),
  primary key (job_description_id, pipeline_candidate_id)
);

create index if not exists pipeline_candidate_pre_interview_notes_candidate_idx
  on public.pipeline_candidate_pre_interview_notes (pipeline_candidate_id);

alter table public.pipeline_candidate_pre_interview_notes enable row level security;

-- Access only via API (service role). Authenticated clients use noop policies like other admin tables.
drop policy if exists pipeline_candidate_pre_interview_notes_noop_select
  on public.pipeline_candidate_pre_interview_notes;
create policy pipeline_candidate_pre_interview_notes_noop_select
  on public.pipeline_candidate_pre_interview_notes for select to authenticated
  using (false);
