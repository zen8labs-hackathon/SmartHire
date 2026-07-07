-- Fix: job_openings / job_descriptions insert/update/delete policies still
-- checked profiles.is_admin only, never updated when the "work_chapter = HR"
-- concept was introduced. requireAdminForRequest() (used by every admin API
-- route that writes these tables, e.g. job-openings/sign-upload, job-
-- descriptions POST) already treats is_admin OR work_chapter = 'HR' as
-- authorized (see lib/admin/require-admin-request.ts), and those routes
-- write through the caller's own RLS-scoped client — so an HR (non-DB-admin)
-- user passed the app-level check but was then rejected by Postgres with
-- "new row violates row-level security policy for table job_openings" on
-- the very first insert of the JD upload flow. candidates got this same fix
-- in 20260409120000 (insert) / 20260506100000 (update/delete); job_openings
-- and job_descriptions never did. (job-descriptions storage bucket uploads
-- go through signed URLs created by the service-role client, bypassing
-- storage.objects RLS entirely, so those policies aren't a blocker and are
-- left as-is.)

drop policy if exists job_openings_admin_insert on public.job_openings;
create policy job_openings_admin_insert
  on public.job_openings for insert to authenticated
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

drop policy if exists job_openings_admin_update on public.job_openings;
create policy job_openings_admin_update
  on public.job_openings for update to authenticated
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

drop policy if exists job_openings_admin_delete on public.job_openings;
create policy job_openings_admin_delete
  on public.job_openings for delete to authenticated
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

drop policy if exists job_descriptions_admin_insert on public.job_descriptions;
create policy job_descriptions_admin_insert
  on public.job_descriptions for insert to authenticated
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

drop policy if exists job_descriptions_admin_update on public.job_descriptions;
create policy job_descriptions_admin_update
  on public.job_descriptions for update to authenticated
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

drop policy if exists job_descriptions_admin_delete on public.job_descriptions;
create policy job_descriptions_admin_delete
  on public.job_descriptions for delete to authenticated
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
