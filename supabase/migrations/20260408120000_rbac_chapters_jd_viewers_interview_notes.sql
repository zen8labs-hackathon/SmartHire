-- RBAC: recruiter work chapter, per-JD viewers, multi-user interview notes (evaluation input).

-- ---------------------------------------------------------------------------
-- profiles.work_chapter: NULL = dashboard-only user; non-null = can access /admin
-- 'HR' (or is_admin) = full access; other values = chapter-scoped recruiter
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists work_chapter text;

update public.profiles
set work_chapter = 'HR'
where is_admin is true and (work_chapter is null or trim(work_chapter) = '');

comment on column public.profiles.work_chapter is
  'NULL = dashboard-only or chapter-only (see profile_chapters). HR = full access. (Legacy non-HR strings migrated to profile_chapters.)';

-- ---------------------------------------------------------------------------
-- JD explicit viewers (non-HR must be listed here to open a JD)
-- ---------------------------------------------------------------------------
create table if not exists public.job_description_viewers (
  job_description_id bigint not null
    references public.job_descriptions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (job_description_id, user_id)
);

create index if not exists job_description_viewers_user_idx
  on public.job_description_viewers (user_id);

alter table public.job_description_viewers enable row level security;

-- HR-only management via app (service role / future policies); block direct client writes for now
drop policy if exists job_description_viewers_noop_select on public.job_description_viewers;
create policy job_description_viewers_noop_select
  on public.job_description_viewers for select to authenticated
  using (false);

-- ---------------------------------------------------------------------------
-- Append-only interview notes (aggregated for AI evaluation PDF)
-- ---------------------------------------------------------------------------
create table if not exists public.candidate_interview_notes (
  id uuid primary key default gen_random_uuid(),
  job_description_id bigint not null
    references public.job_descriptions (id) on delete cascade,
  pipeline_candidate_id uuid not null,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint candidate_interview_notes_body_len check (char_length(body) <= 32000)
);

create index if not exists candidate_interview_notes_lookup_idx
  on public.candidate_interview_notes (
    job_description_id,
    pipeline_candidate_id,
    created_at desc
  );

alter table public.candidate_interview_notes enable row level security;

drop policy if exists candidate_interview_notes_noop_select on public.candidate_interview_notes;
create policy candidate_interview_notes_noop_select
  on public.candidate_interview_notes for select to authenticated
  using (false);
