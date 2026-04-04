-- Filled candidate evaluation PDFs (from admin template + AI), shareable preview by token.

create table if not exists public.candidate_evaluation_reviews (
  id uuid primary key default gen_random_uuid(),
  job_description_id bigint not null
    references public.job_descriptions (id) on delete cascade,
  pipeline_candidate_id uuid not null,
  candidate_name text not null,
  reviewer_notes text not null,
  filled_pdf_storage_path text not null,
  preview_token text not null unique
    default encode(gen_random_bytes(24), 'hex'),
  ai_field_mapping jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists candidate_evaluation_reviews_jd_pipeline_idx
  on public.candidate_evaluation_reviews (job_description_id, pipeline_candidate_id, created_at desc);

alter table public.candidate_evaluation_reviews enable row level security;

drop policy if exists candidate_evaluation_reviews_admin_select
  on public.candidate_evaluation_reviews;
create policy candidate_evaluation_reviews_admin_select
  on public.candidate_evaluation_reviews for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin is true
    )
  );

drop policy if exists candidate_evaluation_reviews_admin_insert
  on public.candidate_evaluation_reviews;
create policy candidate_evaluation_reviews_admin_insert
  on public.candidate_evaluation_reviews for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin is true
    )
  );

-- ---------------------------------------------------------------------------
-- Storage bucket (private): filled PDFs; public read via signed URL / API proxy
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'candidate-evaluation-filled',
  'candidate-evaluation-filled',
  false,
  15728640,
  array['application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists candidate_eval_filled_objects_admin_select on storage.objects;
create policy candidate_eval_filled_objects_admin_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'candidate-evaluation-filled'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin is true
    )
  );

drop policy if exists candidate_eval_filled_objects_admin_insert on storage.objects;
create policy candidate_eval_filled_objects_admin_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'candidate-evaluation-filled'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin is true
    )
  );

drop policy if exists candidate_eval_filled_objects_admin_update on storage.objects;
create policy candidate_eval_filled_objects_admin_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'candidate-evaluation-filled'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin is true
    )
  );

drop policy if exists candidate_eval_filled_objects_admin_delete on storage.objects;
create policy candidate_eval_filled_objects_admin_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'candidate-evaluation-filled'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin is true
    )
  );
