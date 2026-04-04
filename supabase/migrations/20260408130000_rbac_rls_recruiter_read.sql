-- Recruiter read path: HR / is_admin see everything; other staff see JDs they are
-- granted on + candidates whose chapter matches theirs (same JD).

-- ---------------------------------------------------------------------------
-- job_description_viewers: recruiters can see their own grants
-- ---------------------------------------------------------------------------
drop policy if exists job_description_viewers_noop_select on public.job_description_viewers;
create policy job_description_viewers_select_own
  on public.job_description_viewers for select to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- job_descriptions: non-admin HR chapter + explicit viewers (staff only)
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
      select 1
      from public.job_description_viewers v
      inner join public.profiles p on p.id = v.user_id
      where v.job_description_id = job_descriptions.id
        and v.user_id = auth.uid()
        and trim(coalesce(p.work_chapter, '')) <> ''
    )
  );

-- ---------------------------------------------------------------------------
-- job_openings: read openings tied to a visible JD
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
        inner join public.profiles p on p.id = v.user_id
        where v.job_description_id = job_openings.job_description_id
          and v.user_id = auth.uid()
          and trim(coalesce(p.work_chapter, '')) not in ('', 'HR')
      )
    )
  );

-- ---------------------------------------------------------------------------
-- candidates: replace admin-only select with staff/combined visibility
-- ---------------------------------------------------------------------------
drop policy if exists candidates_admin_select on public.candidates;
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
    or (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and trim(coalesce(p.work_chapter, '')) not in ('', 'HR')
          and trim(coalesce(candidates.chapter, '')) = trim(p.work_chapter)
      )
      and exists (
        select 1
        from public.job_openings jo
        inner join public.job_description_viewers v
          on v.job_description_id = jo.job_description_id
         and v.user_id = auth.uid()
        where jo.id = candidates.job_opening_id
      )
    )
  );

-- ---------------------------------------------------------------------------
-- candidate_evaluation_reviews: staff read/write (insert) for visible candidates
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
    or (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and trim(coalesce(p.work_chapter, '')) not in ('', 'HR')
      )
      and exists (
        select 1
        from public.candidates c
        inner join public.profiles p on p.id = auth.uid()
        inner join public.job_openings jo on jo.id = c.job_opening_id
        inner join public.job_description_viewers v
          on v.job_description_id = jo.job_description_id
         and v.user_id = auth.uid()
        where c.id = candidate_evaluation_reviews.pipeline_candidate_id
          and jo.job_description_id = candidate_evaluation_reviews.job_description_id
          and trim(coalesce(c.chapter, '')) = trim(p.work_chapter)
      )
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
      or (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and trim(coalesce(p.work_chapter, '')) not in ('', 'HR')
        )
        and exists (
          select 1
          from public.candidates c
          inner join public.profiles p on p.id = auth.uid()
          inner join public.job_openings jo on jo.id = c.job_opening_id
          inner join public.job_description_viewers v
            on v.job_description_id = jo.job_description_id
           and v.user_id = auth.uid()
          where c.id = candidate_evaluation_reviews.pipeline_candidate_id
            and jo.job_description_id = candidate_evaluation_reviews.job_description_id
            and trim(coalesce(c.chapter, '')) = trim(p.work_chapter)
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- candidate_interview_notes: append-only from authenticated staff
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
      or (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and trim(coalesce(p.work_chapter, '')) not in ('', 'HR')
        )
        and exists (
          select 1
          from public.candidates c
          inner join public.profiles p on p.id = auth.uid()
          inner join public.job_openings jo on jo.id = c.job_opening_id
          inner join public.job_description_viewers v
            on v.job_description_id = jo.job_description_id
           and v.user_id = auth.uid()
          where c.id = candidate_interview_notes.pipeline_candidate_id
            and jo.job_description_id = candidate_interview_notes.job_description_id
            and trim(coalesce(c.chapter, '')) = trim(p.work_chapter)
        )
      )
    )
  );
