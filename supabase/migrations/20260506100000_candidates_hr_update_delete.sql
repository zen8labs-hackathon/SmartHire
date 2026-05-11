-- Align candidates UPDATE/DELETE with INSERT: HR (work_chapter) or admin,
-- matching app/api admin routes that use requireAdminForRequest (isHr).

drop policy if exists candidates_admin_update on public.candidates;
create policy candidates_admin_update
  on public.candidates for update to authenticated
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

drop policy if exists candidates_admin_delete on public.candidates;
create policy candidates_admin_delete
  on public.candidates for delete to authenticated
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
