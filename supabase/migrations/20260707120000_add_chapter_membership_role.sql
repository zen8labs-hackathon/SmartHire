-- Chapter membership role: a profile_chapters row is either 'head' or 'member'.
-- Only heads may see JDs/openings/candidates/reviews/notes granted to their chapter
-- via job_description_viewer_chapters; members keep their chapter membership (for
-- attribution/grouping) but lose the whole-chapter viewer grant entirely.
--
-- Existing rows default to 'member' (strict): nobody is auto-promoted to head by
-- this migration. HR must explicitly mark a user as head for that chapter.

alter table public.profile_chapters
  add column if not exists role text not null default 'member';

alter table public.profile_chapters
  drop constraint if exists profile_chapters_role_check;
alter table public.profile_chapters
  add constraint profile_chapters_role_check check (role in ('head', 'member'));

comment on column public.profile_chapters.role is
  'head = may view this chapter''s whole-chapter JD viewer grants; member = chapter membership only, no JD access via chapter grant.';

-- ---------------------------------------------------------------------------
-- job_description_viewer_chapters: only chapter heads may read the grant row
-- ---------------------------------------------------------------------------
drop policy if exists job_description_viewer_chapters_select_own
  on public.job_description_viewer_chapters;

create policy job_description_viewer_chapters_select_own
  on public.job_description_viewer_chapters for select to authenticated
  using (
    exists (
      select 1 from public.profile_chapters pc
      where pc.chapter_id = job_description_viewer_chapters.chapter_id
        and pc.profile_id = auth.uid()
        and pc.role = 'head'
    )
  );

-- ---------------------------------------------------------------------------
-- job_descriptions: chapter-grant branch requires head role
-- ---------------------------------------------------------------------------
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
       and pc.role = 'head'
      where jvc.job_description_id = job_descriptions.id
    )
  );

-- ---------------------------------------------------------------------------
-- job_openings: chapter-grant branch requires head role
-- ---------------------------------------------------------------------------
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
         and pc.role = 'head'
        where jvc.job_description_id = job_openings.job_description_id
      )
    )
  );

-- ---------------------------------------------------------------------------
-- candidates: chapter-grant branch requires head role
-- ---------------------------------------------------------------------------
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
       and pc.role = 'head'
      where jo.id = candidates.job_opening_id
    )
  );

-- ---------------------------------------------------------------------------
-- candidate_evaluation_reviews: chapter-grant branch requires head role
-- ---------------------------------------------------------------------------
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
       and pc.role = 'head'
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
         and pc.role = 'head'
        where c.id = candidate_evaluation_reviews.pipeline_candidate_id
          and jo.job_description_id = candidate_evaluation_reviews.job_description_id
      )
    )
  );

-- ---------------------------------------------------------------------------
-- candidate_interview_notes: chapter-grant branch requires head role
-- ---------------------------------------------------------------------------
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
         and pc.role = 'head'
        where c.id = candidate_interview_notes.pipeline_candidate_id
          and jo.job_description_id = candidate_interview_notes.job_description_id
      )
    )
  );
