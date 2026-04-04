-- Single global template for candidate interview evaluation (PDF), private storage.

create table if not exists public.candidate_evaluation_template (
  id smallint primary key default 1
    constraint candidate_evaluation_template_single_row check (id = 1),
  storage_path text,
  original_filename text,
  mime_type text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.candidate_evaluation_template (id)
values (1)
on conflict (id) do nothing;

drop trigger if exists candidate_evaluation_template_set_updated_at
  on public.candidate_evaluation_template;
create trigger candidate_evaluation_template_set_updated_at
  before update on public.candidate_evaluation_template
  for each row execute procedure public.set_updated_at();

alter table public.candidate_evaluation_template enable row level security;

drop policy if exists candidate_evaluation_template_admin_select
  on public.candidate_evaluation_template;
create policy candidate_evaluation_template_admin_select
  on public.candidate_evaluation_template for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin is true
    )
  );

drop policy if exists candidate_evaluation_template_admin_update
  on public.candidate_evaluation_template;
create policy candidate_evaluation_template_admin_update
  on public.candidate_evaluation_template for update to authenticated
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

-- ---------------------------------------------------------------------------
-- Storage bucket (private): PDF only, 10 MB
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'candidate-evaluation-template',
  'candidate-evaluation-template',
  false,
  10485760,
  array['application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists candidate_eval_template_objects_admin_select on storage.objects;
create policy candidate_eval_template_objects_admin_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'candidate-evaluation-template'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin is true
    )
  );

drop policy if exists candidate_eval_template_objects_admin_insert on storage.objects;
create policy candidate_eval_template_objects_admin_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'candidate-evaluation-template'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin is true
    )
  );

drop policy if exists candidate_eval_template_objects_admin_update on storage.objects;
create policy candidate_eval_template_objects_admin_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'candidate-evaluation-template'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin is true
    )
  );

drop policy if exists candidate_eval_template_objects_admin_delete on storage.objects;
create policy candidate_eval_template_objects_admin_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'candidate-evaluation-template'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin is true
    )
  );
