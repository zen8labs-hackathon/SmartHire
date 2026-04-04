-- JD file metadata on job_openings + private storage bucket for job description documents.

alter table public.job_openings
  add column if not exists jd_storage_path text,
  add column if not exists jd_original_filename text,
  add column if not exists jd_mime_type text;

-- ---------------------------------------------------------------------------
-- Storage bucket (private): PDF, DOCX, plain text — max 10MB (matches UI)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'job-descriptions',
  'job-descriptions',
  false,
  10485760,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy job_descriptions_objects_admin_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'job-descriptions'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin is true
    )
  );

create policy job_descriptions_objects_admin_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'job-descriptions'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin is true
    )
  );

create policy job_descriptions_objects_admin_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'job-descriptions'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin is true
    )
  );

create policy job_descriptions_objects_admin_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'job-descriptions'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin is true
    )
  );
