-- Structured job_descriptions table and FK from job_openings.

create table if not exists public.job_descriptions (
  id                                    bigint generated always as identity primary key,
  position                              varchar(50)  not null,
  department                            varchar(50),
  status                                varchar(50)  not null default 'Draft',
  update_note                           varchar(50),
  work_location                         varchar(255),
  reporting                             varchar(255),
  role_overview                         varchar(255),
  duties_and_responsibilities           text,
  experience_requirements_must_have     text,
  experience_requirements_nice_to_have  text,
  what_we_offer                         text,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null
);

create index if not exists job_descriptions_status_idx
  on public.job_descriptions (status);

create index if not exists job_descriptions_created_at_idx
  on public.job_descriptions (created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at trigger (reuses set_updated_at defined in candidates migration)
-- ---------------------------------------------------------------------------

drop trigger if exists job_descriptions_set_updated_at on public.job_descriptions;
create trigger job_descriptions_set_updated_at
  before update on public.job_descriptions
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Link job_openings → job_descriptions (optional, for future candidate join)
-- ---------------------------------------------------------------------------

alter table public.job_openings
  add column if not exists job_description_id bigint
    references public.job_descriptions (id) on delete set null;

-- ---------------------------------------------------------------------------
-- RLS: admin-only
-- ---------------------------------------------------------------------------

alter table public.job_descriptions enable row level security;

drop policy if exists job_descriptions_admin_select on public.job_descriptions;
create policy job_descriptions_admin_select
  on public.job_descriptions for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin is true
    )
  );

drop policy if exists job_descriptions_admin_insert on public.job_descriptions;
create policy job_descriptions_admin_insert
  on public.job_descriptions for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin is true
    )
  );

drop policy if exists job_descriptions_admin_update on public.job_descriptions;
create policy job_descriptions_admin_update
  on public.job_descriptions for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin is true
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin is true
    )
  );

drop policy if exists job_descriptions_admin_delete on public.job_descriptions;
create policy job_descriptions_admin_delete
  on public.job_descriptions for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin is true
    )
  );
