-- Pipeline stages for JD detail: interview scheduling, offer, failed.

alter table public.candidates
  drop constraint if exists candidates_status_check;

alter table public.candidates
  add constraint candidates_status_check
    check (status in ('New', 'Shortlisted', 'Interviewing', 'Offer', 'Failed'));

alter table public.candidates
  add column if not exists interview_at timestamptz;

alter table public.candidates
  add column if not exists onboarding_at timestamptz;

create index if not exists candidates_interview_at_idx
  on public.candidates (interview_at asc nulls last);

create index if not exists candidates_onboarding_at_idx
  on public.candidates (onboarding_at asc nulls last);
