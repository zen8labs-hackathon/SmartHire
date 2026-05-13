-- CV detail versioning: monotonic counter on active row + append-only event log.

alter table public.candidates
  add column if not exists cv_detail_version integer not null default 1;

alter table public.candidates
  add constraint candidates_cv_detail_version_positive
  check (cv_detail_version >= 1);

create index if not exists candidates_cv_detail_version_idx
  on public.candidates (cv_detail_version);

create table if not exists public.candidate_cv_detail_version_events (
  id bigint generated always as identity primary key,
  active_candidate_id uuid not null references public.candidates (id) on delete cascade,
  version integer not null,
  event_type text not null
    constraint candidate_cv_detail_version_events_type_check
    check (event_type in ('profile_edit', 'pre_restore', 'full_restore')),
  change_summary text,
  created_at timestamptz not null default now(),
  snapshot jsonb not null
);

create index if not exists candidate_cv_detail_version_events_active_version_idx
  on public.candidate_cv_detail_version_events (active_candidate_id, version desc);

create index if not exists candidate_cv_detail_version_events_active_created_idx
  on public.candidate_cv_detail_version_events (active_candidate_id, created_at desc);

alter table public.candidate_cv_detail_version_events enable row level security;

drop policy if exists candidate_cv_detail_version_events_staff_select
  on public.candidate_cv_detail_version_events;
create policy candidate_cv_detail_version_events_staff_select
  on public.candidate_cv_detail_version_events for select to authenticated
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

drop policy if exists candidate_cv_detail_version_events_staff_insert
  on public.candidate_cv_detail_version_events;
create policy candidate_cv_detail_version_events_staff_insert
  on public.candidate_cv_detail_version_events for insert to authenticated
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

drop policy if exists candidate_cv_detail_version_events_staff_update
  on public.candidate_cv_detail_version_events;
create policy candidate_cv_detail_version_events_staff_update
  on public.candidate_cv_detail_version_events for update to authenticated
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

drop policy if exists candidate_cv_detail_version_events_staff_delete
  on public.candidate_cv_detail_version_events;
create policy candidate_cv_detail_version_events_staff_delete
  on public.candidate_cv_detail_version_events for delete to authenticated
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
