-- Migration: Add is_default and is_passed to pipeline_sub_stages, unique indexes, and triggers.

-- 1. Add columns to pipeline_sub_stages if not exist
alter table public.pipeline_sub_stages
  add column if not exists is_default boolean not null default false,
  add column if not exists is_passed boolean not null default false;

-- 2. Create unique indexes to guarantee at most one active is_default and is_passed sub-stage per stage
drop index if exists public.pipeline_sub_stages_stage_default_idx;
create unique index pipeline_sub_stages_stage_default_idx 
  on public.pipeline_sub_stages (pipeline_stage_id) 
  where (is_default is true and deleted_at is null);

drop index if exists public.pipeline_sub_stages_stage_passed_idx;
create unique index pipeline_sub_stages_stage_passed_idx 
  on public.pipeline_sub_stages (pipeline_stage_id) 
  where (is_passed is true and deleted_at is null);

-- 3. Define the recursion-safe trigger function
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

-- 4. Re-bind the trigger to the table
drop trigger if exists pipeline_sub_stages_default_trigger on public.pipeline_sub_stages;
create trigger pipeline_sub_stages_default_trigger
  before insert or update on public.pipeline_sub_stages
  for each row execute procedure public.handle_pipeline_sub_stages_default();

-- 5. Seed/Update default and passed markers for existing standard sub-stages
update public.pipeline_sub_stages
set is_default = true
where code in ('new', 'interview', 'offer')
  and deleted_at is null;

update public.pipeline_sub_stages
set is_passed = true
where code in ('passed', 'matched')
  and deleted_at is null;
