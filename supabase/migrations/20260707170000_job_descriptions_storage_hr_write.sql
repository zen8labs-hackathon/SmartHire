-- Same is_admin-only gap as job_openings/job_descriptions/candidate-cvs,
-- for consistency: the 'job-descriptions' storage bucket (JD source file)
-- policies never got the HR branch either. No current code path hits this
-- via the caller's own session client (uploads go through a signed URL from
-- the service-role client; deletes only remove admin/service-role-created
-- draft rows), but fixing it now prevents the same latent bug candidate-cvs
-- just had if a future route switches to the user-scoped client.

drop policy if exists job_descriptions_objects_admin_select on storage.objects;
create policy job_descriptions_objects_admin_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'job-descriptions'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.is_admin is true
          or trim(coalesce(p.work_chapter, '')) = 'HR'
        )
    )
  );

drop policy if exists job_descriptions_objects_admin_insert on storage.objects;
create policy job_descriptions_objects_admin_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'job-descriptions'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.is_admin is true
          or trim(coalesce(p.work_chapter, '')) = 'HR'
        )
    )
  );

drop policy if exists job_descriptions_objects_admin_update on storage.objects;
create policy job_descriptions_objects_admin_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'job-descriptions'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.is_admin is true
          or trim(coalesce(p.work_chapter, '')) = 'HR'
        )
    )
  );

drop policy if exists job_descriptions_objects_admin_delete on storage.objects;
create policy job_descriptions_objects_admin_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'job-descriptions'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.is_admin is true
          or trim(coalesce(p.work_chapter, '')) = 'HR'
        )
    )
  );
