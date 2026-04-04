-- Smoke test for Vercel / apply-vercel-migrations.mjs (no FKs to other tables).
-- Safe to DROP TABLE public.migration_smoke_test after you confirm deploys apply migrations.

create table if not exists public.migration_smoke_test (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  note text not null default 'vercel-migration-smoke'
);

comment on table public.migration_smoke_test is
  'Sample table for migration runner verification; not used by the app.';

alter table public.migration_smoke_test enable row level security;
