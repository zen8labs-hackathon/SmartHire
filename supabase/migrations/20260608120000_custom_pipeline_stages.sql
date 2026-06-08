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
  is_default boolean not null default false,
  is_passed boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists pipeline_sub_stages_deleted_at_idx on public.pipeline_sub_stages (deleted_at) where (deleted_at is null);
create unique index if not exists pipeline_sub_stages_stage_code_idx on public.pipeline_sub_stages (pipeline_stage_id, code) where (deleted_at is null);

-- Unique indexes to guarantee at most one active is_default and is_passed sub-stage per stage
create unique index if not exists pipeline_sub_stages_stage_default_idx 
  on public.pipeline_sub_stages (pipeline_stage_id) 
  where (is_default is true and deleted_at is null);

create unique index if not exists pipeline_sub_stages_stage_passed_idx 
  on public.pipeline_sub_stages (pipeline_stage_id) 
  where (is_passed is true and deleted_at is null);

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

-- Trigger to automate is_default and is_passed constraints on pipeline_sub_stages
create or replace function public.handle_pipeline_sub_stages_default()
returns trigger
language plpgsql
as $$
declare
  active_count integer;
  next_id uuid;
begin
  -- Prevent trigger recursion recursion
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  -- 1. Handling deletes (soft delete)
  if (TG_OP = 'UPDATE' and new.deleted_at is not null and old.deleted_at is null) then
    -- Handle is_default reassignment on deletion
    if old.is_default then
      select id into next_id
      from public.pipeline_sub_stages
      where pipeline_stage_id = old.pipeline_stage_id
        and id != old.id
        and deleted_at is null
      order by sequence_number asc, created_at asc
      limit 1;

      if next_id is not null then
        update public.pipeline_sub_stages
        set is_default = true
        where id = next_id;
      end if;
      new.is_default := false;
    end if;
    -- Reset is_passed on deleted item
    new.is_passed := false;
    return new;
  end if;

  -- 2. Handling inserts
  if (TG_OP = 'INSERT') then
    select count(*) into active_count
    from public.pipeline_sub_stages
    where pipeline_stage_id = new.pipeline_stage_id
      and deleted_at is null;

    -- The first active sub-stage of a stage must always be default
    if active_count = 0 then
      new.is_default := true;
    elsif new.is_default then
      -- Uncheck other default sub-stages
      update public.pipeline_sub_stages
      set is_default = false
      where pipeline_stage_id = new.pipeline_stage_id
        and is_default = true
        and deleted_at is null;
    end if;

    if new.is_passed then
      -- Uncheck other passed sub-stages
      update public.pipeline_sub_stages
      set is_passed = false
      where pipeline_stage_id = new.pipeline_stage_id
        and is_passed = true
        and deleted_at is null;
    end if;
    return new;
  end if;

  -- 3. Handling normal updates
  if (TG_OP = 'UPDATE') then
    -- Handle is_default transition to true
    if new.is_default and not old.is_default then
      update public.pipeline_sub_stages
      set is_default = false
      where pipeline_stage_id = new.pipeline_stage_id
        and id != new.id
        and is_default = true
        and deleted_at is null;
    -- Handle is_default transition to false (not allowed unless another default exists, or we auto-assign)
    elsif not new.is_default and old.is_default then
      select count(*) into active_count
      from public.pipeline_sub_stages
      where pipeline_stage_id = new.pipeline_stage_id
        and id != new.id
        and deleted_at is null;

      if active_count > 0 then
        -- Find next active sub-stage to set as default
        select id into next_id
        from public.pipeline_sub_stages
        where pipeline_stage_id = new.pipeline_stage_id
          and id != new.id
          and deleted_at is null
        order by sequence_number asc, created_at asc
        limit 1;

        update public.pipeline_sub_stages
        set is_default = true
        where id = next_id;
      else
        -- If it is the last sub-stage left, it must stay default
        new.is_default := true;
      end if;
    end if;

    -- Handle is_passed transition to true
    if new.is_passed and not old.is_passed then
      update public.pipeline_sub_stages
      set is_passed = false
      where pipeline_stage_id = new.pipeline_stage_id
        and id != new.id
        and is_passed = true
        and deleted_at is null;
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists pipeline_sub_stages_default_trigger on public.pipeline_sub_stages;
create trigger pipeline_sub_stages_default_trigger
  before insert or update on public.pipeline_sub_stages
  for each row execute procedure public.handle_pipeline_sub_stages_default();
