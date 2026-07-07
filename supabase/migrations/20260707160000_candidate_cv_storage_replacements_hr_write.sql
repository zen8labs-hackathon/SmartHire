-- Fix: two more spots still checked profiles.is_admin only, blocking HR
-- (non-DB-admin) from editing/deleting CVs, even though the app-level gate
-- (requireAdminForRequest -> access.isHr) already allows HR through:
--
-- 1. storage.objects for the 'candidate-cvs' bucket. Initial CV upload goes
--    through a signed URL minted by the service-role client (bypasses RLS),
--    but candidate delete (app/api/admin/candidates/[id]/route.ts DELETE,
--    storage.remove) and CV-replace merge (update-with-history/route.ts,
--    storage.move old/new file) call storage directly with the caller's own
--    session client, so these ARE subject to storage.objects RLS.
-- 2. candidate_cv_replacements (version-chain history row written by both
--    replace/route.ts and update-with-history/route.ts on every CV
--    replace/merge) had no HR branch at all on any of its 4 policies.

drop policy if exists candidate_cvs_objects_admin_select on storage.objects;
create policy candidate_cvs_objects_admin_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'candidate-cvs'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.is_admin is true
          or trim(coalesce(p.work_chapter, '')) = 'HR'
        )
    )
  );

drop policy if exists candidate_cvs_objects_admin_insert on storage.objects;
create policy candidate_cvs_objects_admin_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'candidate-cvs'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.is_admin is true
          or trim(coalesce(p.work_chapter, '')) = 'HR'
        )
    )
  );

drop policy if exists candidate_cvs_objects_admin_update on storage.objects;
create policy candidate_cvs_objects_admin_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'candidate-cvs'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.is_admin is true
          or trim(coalesce(p.work_chapter, '')) = 'HR'
        )
    )
  );

drop policy if exists candidate_cvs_objects_admin_delete on storage.objects;
create policy candidate_cvs_objects_admin_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'candidate-cvs'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.is_admin is true
          or trim(coalesce(p.work_chapter, '')) = 'HR'
        )
    )
  );

drop policy if exists candidate_cv_replacements_admin_select on public.candidate_cv_replacements;
create policy candidate_cv_replacements_admin_select
  on public.candidate_cv_replacements for select to authenticated
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

drop policy if exists candidate_cv_replacements_admin_insert on public.candidate_cv_replacements;
create policy candidate_cv_replacements_admin_insert
  on public.candidate_cv_replacements for insert to authenticated
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

drop policy if exists candidate_cv_replacements_admin_update on public.candidate_cv_replacements;
create policy candidate_cv_replacements_admin_update
  on public.candidate_cv_replacements for update to authenticated
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

drop policy if exists candidate_cv_replacements_admin_delete on public.candidate_cv_replacements;
create policy candidate_cv_replacements_admin_delete
  on public.candidate_cv_replacements for delete to authenticated
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
