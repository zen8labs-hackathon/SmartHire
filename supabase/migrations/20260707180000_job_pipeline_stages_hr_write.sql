-- job_pipeline_stages exists in the live database but was never captured by
-- any migration in this repo (created out-of-band, not even recorded in
-- supabase_migrations.schema_migrations) — separate drift from the
-- migration_test_table issue noted in 20260707120000. This migration both
-- backfills its definition for fresh environments (create table/index if
-- not exists — safe no-op here since the table already exists) and fixes
-- its RLS: all 4 policies were is_admin-only, so HR (work_chapter = 'HR',
-- non-DB-admin) hit "new row violates row-level security policy for table
-- job_pipeline_stages" when uploading a new JD (the create-JD flow inserts
-- the default pipeline stages for the new job opening here).

create table if not exists public.job_pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  job_opening_id uuid not null references public.job_openings (id) on delete cascade,
  code text not null,
  label text not null,
  sort_order integer not null default 0,
  is_terminal boolean not null default false,
  created_at timestamptz not null default now(),
  constraint job_pipeline_stages_job_code_unique unique (job_opening_id, code)
);

create index if not exists job_pipeline_stages_job_sort_idx
  on public.job_pipeline_stages (job_opening_id, sort_order);

alter table public.job_pipeline_stages enable row level security;

drop policy if exists job_pipeline_stages_admin_select on public.job_pipeline_stages;
create policy job_pipeline_stages_admin_select
  on public.job_pipeline_stages for select to authenticated
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

drop policy if exists job_pipeline_stages_admin_insert on public.job_pipeline_stages;
create policy job_pipeline_stages_admin_insert
  on public.job_pipeline_stages for insert to authenticated
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

drop policy if exists job_pipeline_stages_admin_update on public.job_pipeline_stages;
create policy job_pipeline_stages_admin_update
  on public.job_pipeline_stages for update to authenticated
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

drop policy if exists job_pipeline_stages_admin_delete on public.job_pipeline_stages;
create policy job_pipeline_stages_admin_delete
  on public.job_pipeline_stages for delete to authenticated
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
