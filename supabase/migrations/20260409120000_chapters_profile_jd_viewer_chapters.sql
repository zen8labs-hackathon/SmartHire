-- Chapters registry, profile↔chapter membership, JD viewer grants by chapter.
-- Removes per-candidate chapter; RLS uses JD viewers (email) + viewer chapters + profile_chapters.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.chapters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  constraint chapters_name_trim check (trim(name) = name and char_length(name) > 0),
  constraint chapters_name_len check (char_length(name) <= 120),
  constraint chapters_name_unique unique (name)
);

create table if not exists public.profile_chapters (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, chapter_id)
);

create index if not exists profile_chapters_chapter_id_idx
  on public.profile_chapters (chapter_id);

create table if not exists public.job_description_viewer_chapters (
  job_description_id bigint not null
    references public.job_descriptions (id) on delete cascade,
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (job_description_id, chapter_id)
);

create index if not exists job_description_viewer_chapters_chapter_idx
  on public.job_description_viewer_chapters (chapter_id);

-- ---------------------------------------------------------------------------
-- Migrate legacy profiles.work_chapter (non-HR) → profile_chapters
-- ---------------------------------------------------------------------------
insert into public.chapters (name)
select distinct trim(p.work_chapter)
from public.profiles p
where trim(coalesce(p.work_chapter, '')) not in ('', 'HR')
  and not exists (
    select 1 from public.chapters c where c.name = trim(p.work_chapter)
  );

insert into public.profile_chapters (profile_id, chapter_id)
select p.id, c.id
from public.profiles p
inner join public.chapters c on c.name = trim(p.work_chapter)
where trim(coalesce(p.work_chapter, '')) not in ('', 'HR')
on conflict do nothing;

update public.profiles
set work_chapter = null
where trim(coalesce(work_chapter, '')) not in ('', 'HR');

comment on column public.profiles.work_chapter is
  'NULL = dashboard-only or chapter-only (see profile_chapters). HR = full recruiting access.';

-- ---------------------------------------------------------------------------
-- Candidates: attribution + drop legacy chapter column
-- ---------------------------------------------------------------------------
alter table public.candidates
  add column if not exists uploaded_by_email text;

alter table public.candidates
  drop column if exists chapter;

-- HR (work_chapter) may create candidate rows for CV upload, not only is_admin.
drop policy if exists candidates_admin_insert on public.candidates;
create policy candidates_admin_insert
  on public.candidates for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.is_admin is true
          or trim(coalesce(p.work_chapter, '')) = 'HR'
        )
    )
  );

-- ---------------------------------------------------------------------------
-- RLS: new tables
-- ---------------------------------------------------------------------------
alter table public.chapters enable row level security;
alter table public.profile_chapters enable row level security;
alter table public.job_description_viewer_chapters enable row level security;

drop policy if exists chapters_authenticated_select on public.chapters;
create policy chapters_authenticated_select
  on public.chapters for select to authenticated
  using (true);

drop policy if exists chapters_hr_insert on public.chapters;
create policy chapters_hr_insert
  on public.chapters for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.is_admin is true
          or trim(coalesce(p.work_chapter, '')) = 'HR'
        )
    )
  );

drop policy if exists chapters_hr_update on public.chapters;
create policy chapters_hr_update
  on public.chapters for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.is_admin is true
          or trim(coalesce(p.work_chapter, '')) = 'HR'
        )
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.is_admin is true
          or trim(coalesce(p.work_chapter, '')) = 'HR'
        )
    )
  );

drop policy if exists chapters_hr_delete on public.chapters;
create policy chapters_hr_delete
  on public.chapters for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.is_admin is true
          or trim(coalesce(p.work_chapter, '')) = 'HR'
        )
    )
  );

drop policy if exists profile_chapters_select_own on public.profile_chapters;
create policy profile_chapters_select_own
  on public.profile_chapters for select to authenticated
  using (profile_id = auth.uid());

drop policy if exists job_description_viewer_chapters_deny on public.job_description_viewer_chapters;
create policy job_description_viewer_chapters_deny
  on public.job_description_viewer_chapters for all to authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- Replace recruiter read policies (no candidates.chapter)
-- ---------------------------------------------------------------------------
drop policy if exists job_description_viewers_select_own on public.job_description_viewers;
create policy job_description_viewers_select_own
  on public.job_description_viewers for select to authenticated
  using (user_id = auth.uid());

drop policy if exists job_descriptions_recruiter_select on public.job_descriptions;
create policy job_descriptions_recruiter_select
  on public.job_descriptions for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.is_admin is not true
        and trim(coalesce(p.work_chapter, '')) = 'HR'
    )
    or exists (
      select 1 from public.job_description_viewers v
      where v.job_description_id = job_descriptions.id
        and v.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.job_description_viewer_chapters jvc
      inner join public.profile_chapters pc
        on pc.chapter_id = jvc.chapter_id
       and pc.profile_id = auth.uid()
      where jvc.job_description_id = job_descriptions.id
    )
  );

drop policy if exists job_openings_recruiter_select on public.job_openings;
create policy job_openings_recruiter_select
  on public.job_openings for select to authenticated
  using (
    job_openings.job_description_id is not null
    and exists (
      select 1 from public.job_descriptions jd
      where jd.id = job_openings.job_description_id
    )
    and (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and (p.is_admin is true or trim(coalesce(p.work_chapter, '')) = 'HR')
      )
      or exists (
        select 1
        from public.job_description_viewers v
        where v.job_description_id = job_openings.job_description_id
          and v.user_id = auth.uid()
      )
      or exists (
        select 1
        from public.job_description_viewer_chapters jvc
        inner join public.profile_chapters pc
          on pc.chapter_id = jvc.chapter_id
         and pc.profile_id = auth.uid()
        where jvc.job_description_id = job_openings.job_description_id
      )
    )
  );

drop policy if exists candidates_staff_select on public.candidates;
create policy candidates_staff_select
  on public.candidates for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.is_admin is true
          or trim(coalesce(p.work_chapter, '')) = 'HR'
        )
    )
    or exists (
      select 1
      from public.job_openings jo
      inner join public.job_description_viewers v
        on v.job_description_id = jo.job_description_id
       and v.user_id = auth.uid()
      where jo.id = candidates.job_opening_id
    )
    or exists (
      select 1
      from public.job_openings jo
      inner join public.job_description_viewer_chapters jvc
        on jvc.job_description_id = jo.job_description_id
      inner join public.profile_chapters pc
        on pc.chapter_id = jvc.chapter_id
       and pc.profile_id = auth.uid()
      where jo.id = candidates.job_opening_id
    )
  );

drop policy if exists candidate_evaluation_reviews_staff_select
  on public.candidate_evaluation_reviews;
create policy candidate_evaluation_reviews_staff_select
  on public.candidate_evaluation_reviews for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.is_admin is true
          or trim(coalesce(p.work_chapter, '')) = 'HR'
        )
    )
    or exists (
      select 1
      from public.candidates c
      inner join public.job_openings jo on jo.id = c.job_opening_id
      inner join public.job_description_viewers v
        on v.job_description_id = jo.job_description_id
       and v.user_id = auth.uid()
      where c.id = candidate_evaluation_reviews.pipeline_candidate_id
        and jo.job_description_id = candidate_evaluation_reviews.job_description_id
    )
    or exists (
      select 1
      from public.candidates c
      inner join public.job_openings jo on jo.id = c.job_opening_id
      inner join public.job_description_viewer_chapters jvc
        on jvc.job_description_id = jo.job_description_id
      inner join public.profile_chapters pc
        on pc.chapter_id = jvc.chapter_id
       and pc.profile_id = auth.uid()
      where c.id = candidate_evaluation_reviews.pipeline_candidate_id
        and jo.job_description_id = candidate_evaluation_reviews.job_description_id
    )
  );

drop policy if exists candidate_evaluation_reviews_staff_insert
  on public.candidate_evaluation_reviews;
create policy candidate_evaluation_reviews_staff_insert
  on public.candidate_evaluation_reviews for insert to authenticated
  with check (
    coalesce(created_by, auth.uid()) = auth.uid()
    and (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and (
            p.is_admin is true
            or trim(coalesce(p.work_chapter, '')) = 'HR'
          )
      )
      or exists (
        select 1
        from public.candidates c
        inner join public.job_openings jo on jo.id = c.job_opening_id
        inner join public.job_description_viewers v
          on v.job_description_id = jo.job_description_id
         and v.user_id = auth.uid()
        where c.id = candidate_evaluation_reviews.pipeline_candidate_id
          and jo.job_description_id = candidate_evaluation_reviews.job_description_id
      )
      or exists (
        select 1
        from public.candidates c
        inner join public.job_openings jo on jo.id = c.job_opening_id
        inner join public.job_description_viewer_chapters jvc
          on jvc.job_description_id = jo.job_description_id
        inner join public.profile_chapters pc
          on pc.chapter_id = jvc.chapter_id
         and pc.profile_id = auth.uid()
        where c.id = candidate_evaluation_reviews.pipeline_candidate_id
          and jo.job_description_id = candidate_evaluation_reviews.job_description_id
      )
    )
  );

drop policy if exists candidate_interview_notes_staff_insert
  on public.candidate_interview_notes;
create policy candidate_interview_notes_staff_insert
  on public.candidate_interview_notes for insert to authenticated
  with check (
    author_id = auth.uid()
    and (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and (
            p.is_admin is true
            or trim(coalesce(p.work_chapter, '')) = 'HR'
          )
      )
      or exists (
        select 1
        from public.candidates c
        inner join public.job_openings jo on jo.id = c.job_opening_id
        inner join public.job_description_viewers v
          on v.job_description_id = jo.job_description_id
         and v.user_id = auth.uid()
        where c.id = candidate_interview_notes.pipeline_candidate_id
          and jo.job_description_id = candidate_interview_notes.job_description_id
      )
      or exists (
        select 1
        from public.candidates c
        inner join public.job_openings jo on jo.id = c.job_opening_id
        inner join public.job_description_viewer_chapters jvc
          on jvc.job_description_id = jo.job_description_id
        inner join public.profile_chapters pc
          on pc.chapter_id = jvc.chapter_id
         and pc.profile_id = auth.uid()
        where c.id = candidate_interview_notes.pipeline_candidate_id
          and jo.job_description_id = candidate_interview_notes.job_description_id
      )
    )
  );
