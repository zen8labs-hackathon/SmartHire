-- Job openings (campaigns), candidates, private CV storage, admin RLS, Realtime.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.job_openings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status text not null default 'Active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.candidates (
  id uuid primary key default gen_random_uuid(),
  job_opening_id uuid references public.job_openings (id) on delete set null,
  cv_storage_path text not null,
  original_filename text not null,
  mime_type text,
  parsing_status text not null default 'pending'
    constraint candidates_parsing_status_check
      check (parsing_status in ('pending', 'processing', 'completed', 'failed')),
  parsing_error text,
  parsed_payload jsonb,
  name text,
  role text,
  avatar_url text,
  experience_years numeric,
  skills text[] not null default '{}',
  degree text,
  school text,
  status text not null default 'New'
    constraint candidates_status_check
      check (status in ('New', 'Shortlisted', 'Interviewing')),
  chapter text not null default 'Engineering',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists candidates_job_opening_id_idx
  on public.candidates (job_opening_id);

create index if not exists candidates_parsing_status_idx
  on public.candidates (parsing_status);

create index if not exists candidates_created_at_idx
  on public.candidates (created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists job_openings_set_updated_at on public.job_openings;
create trigger job_openings_set_updated_at
  before update on public.job_openings
  for each row execute procedure public.set_updated_at();

drop trigger if exists candidates_set_updated_at on public.candidates;
create trigger candidates_set_updated_at
  before update on public.candidates
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: admin-only (profiles.is_admin)
-- ---------------------------------------------------------------------------

alter table public.job_openings enable row level security;
alter table public.candidates enable row level security;

drop policy if exists job_openings_admin_select on public.job_openings;
create policy job_openings_admin_select
  on public.job_openings for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin is true
    )
  );

drop policy if exists job_openings_admin_insert on public.job_openings;
create policy job_openings_admin_insert
  on public.job_openings for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin is true
    )
  );

drop policy if exists job_openings_admin_update on public.job_openings;
create policy job_openings_admin_update
  on public.job_openings for update to authenticated
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

drop policy if exists job_openings_admin_delete on public.job_openings;
create policy job_openings_admin_delete
  on public.job_openings for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin is true
    )
  );

drop policy if exists candidates_admin_select on public.candidates;
create policy candidates_admin_select
  on public.candidates for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin is true
    )
  );

drop policy if exists candidates_admin_insert on public.candidates;
create policy candidates_admin_insert
  on public.candidates for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin is true
    )
  );

drop policy if exists candidates_admin_update on public.candidates;
create policy candidates_admin_update
  on public.candidates for update to authenticated
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

drop policy if exists candidates_admin_delete on public.candidates;
create policy candidates_admin_delete
  on public.candidates for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin is true
    )
  );

-- ---------------------------------------------------------------------------
-- Seed job openings (dev / demo)
-- ---------------------------------------------------------------------------

insert into public.job_openings (title, status)
select 'Senior Product Designer', 'Active'
where not exists (select 1 from public.job_openings where title = 'Senior Product Designer');

insert into public.job_openings (title, status)
select 'UX Architect', 'Active'
where not exists (select 1 from public.job_openings where title = 'UX Architect');

insert into public.job_openings (title, status)
select 'Full-stack Engineer', 'Active'
where not exists (select 1 from public.job_openings where title = 'Full-stack Engineer');

-- ---------------------------------------------------------------------------
-- Storage bucket (private)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'candidate-cvs',
  'candidate-cvs',
  false,
  26214400,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Storage RLS: admins may manage objects in candidate-cvs (signed uploads use service role + token)

drop policy if exists candidate_cvs_objects_admin_select on storage.objects;
create policy candidate_cvs_objects_admin_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'candidate-cvs'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin is true
    )
  );

drop policy if exists candidate_cvs_objects_admin_insert on storage.objects;
create policy candidate_cvs_objects_admin_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'candidate-cvs'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin is true
    )
  );

drop policy if exists candidate_cvs_objects_admin_update on storage.objects;
create policy candidate_cvs_objects_admin_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'candidate-cvs'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin is true
    )
  );

drop policy if exists candidate_cvs_objects_admin_delete on storage.objects;
create policy candidate_cvs_objects_admin_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'candidate-cvs'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin is true
    )
  );

-- ---------------------------------------------------------------------------
-- Realtime: broadcast candidate row changes to subscribed admins
-- ---------------------------------------------------------------------------

alter table public.candidates replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'candidates'
  ) then
    execute 'alter publication supabase_realtime add table public.candidates';
  end if;
end;
$$;
