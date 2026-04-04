-- CV vs job description match score (0–100) from AI, plus status for async pipeline.

alter table public.candidates
  add column if not exists jd_match_score smallint,
  add column if not exists jd_match_status text not null default 'pending',
  add column if not exists jd_match_error text,
  add column if not exists jd_match_rationale text;

alter table public.candidates
  drop constraint if exists candidates_jd_match_score_check;

alter table public.candidates
  add constraint candidates_jd_match_score_check
  check (jd_match_score is null or (jd_match_score >= 0 and jd_match_score <= 100));

alter table public.candidates
  drop constraint if exists candidates_jd_match_status_check;

alter table public.candidates
  add constraint candidates_jd_match_status_check
  check (
    jd_match_status in ('pending', 'processing', 'completed', 'failed', 'skipped')
  );

create index if not exists candidates_jd_match_score_idx
  on public.candidates (jd_match_score desc nulls last);
