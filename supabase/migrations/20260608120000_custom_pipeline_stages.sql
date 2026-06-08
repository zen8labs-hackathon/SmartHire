-- Custom pipeline stages, sub stages, job stage mappings, and updated candidate columns.

-- 1. Create pipeline_stages
create table if not exists public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  label text not null,
  "desc" text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists pipeline_stages_deleted_at_idx on public.pipeline_stages (deleted_at) where (deleted_at is null);
create unique index if not exists pipeline_stages_code_idx on public.pipeline_stages (code) where (deleted_at is null);

-- 2. Create pipeline_sub_stages
create table if not exists public.pipeline_sub_stages (
  id uuid primary key default gen_random_uuid(),
  pipeline_stage_id uuid not null references public.pipeline_stages (id) on delete cascade,
  code text not null,
  label text not null,
  sequence_number integer not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists pipeline_sub_stages_deleted_at_idx on public.pipeline_sub_stages (deleted_at) where (deleted_at is null);
create unique index if not exists pipeline_sub_stages_stage_code_idx on public.pipeline_sub_stages (pipeline_stage_id, code) where (deleted_at is null);

-- 3. Create job_stage_mappings
create table if not exists public.job_stage_mappings (
  id uuid primary key default gen_random_uuid(),
  job_opening_id uuid not null references public.job_openings (id) on delete cascade,
  pipeline_stage_id uuid not null references public.pipeline_stages (id),
  sequence_number integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists job_stage_mappings_deleted_at_idx on public.job_stage_mappings (deleted_at) where (deleted_at is null);
-- Ensure uniqueness of active stage mappings per job opening
create unique index if not exists job_stage_mappings_job_stage_idx on public.job_stage_mappings (job_opening_id, pipeline_stage_id) where (deleted_at is null);

-- 4. Add new columns to candidates (legacy status remains untouched)
alter table public.candidates
  add column if not exists current_job_stage_mapping_id uuid references public.job_stage_mappings (id) on delete restrict,
  add column if not exists current_sub_state_id uuid references public.pipeline_sub_stages (id) on delete restrict,
  add column if not exists offered_at timestamptz;

create index if not exists candidates_current_job_stage_mapping_idx on public.candidates (current_job_stage_mapping_id);
create index if not exists candidates_current_sub_state_idx on public.candidates (current_sub_state_id);

-- Update triggers for updated_at
drop trigger if exists pipeline_stages_set_updated_at on public.pipeline_stages;
create trigger pipeline_stages_set_updated_at
  before update on public.pipeline_stages
  for each row execute procedure public.set_updated_at();

drop trigger if exists job_stage_mappings_set_updated_at on public.job_stage_mappings;
create trigger job_stage_mappings_set_updated_at
  before update on public.job_stage_mappings
  for each row execute procedure public.set_updated_at();
