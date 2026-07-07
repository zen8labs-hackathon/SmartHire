-- Fix: "No JD file found for this job opening." for HR when uploading a new
-- JD. job_openings_recruiter_select requires job_description_id IS NOT NULL
-- before even considering the HR/admin branch — but a freshly uploaded JD
-- file creates a *draft* job_openings row with job_description_id still
-- null (it's only linked once the JD form is actually saved). The old
-- job_openings_admin_select policy (is_admin only, no such requirement)
-- happened to cover this gap for true DB admins, which is why the bug only
-- showed up for HR (work_chapter = 'HR', is_admin = false) accounts:
-- /api/admin/job-descriptions/extract re-selects the draft row by id to
-- read jd_storage_path, RLS returned 0 rows for HR, and the route reported
-- the row as missing.
--
-- Fix: let HR/admin see every job_openings row unconditionally (matching
-- what job_openings_admin_select already grants true admins); keep the
-- named-viewer / chapter-head-viewer branches gated on having an actual
-- linked job_description, since those grants are meaningless without one.

drop policy if exists job_openings_recruiter_select on public.job_openings;
create policy job_openings_recruiter_select
  on public.job_openings for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.is_admin is true or trim(coalesce(p.work_chapter, '')) = 'HR')
    )
    or (
      job_openings.job_description_id is not null
      and exists (
        select 1 from public.job_descriptions jd
        where jd.id = job_openings.job_description_id
      )
      and (
        exists (
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
    )
  );
