-- Candidate duplicate-replace flow:
-- - Keep old candidate rows for CV history
-- - Mark active candidate rows for list/dashboard
-- - Persist replacement history entries

alter table public.candidates
  add column if not exists is_active boolean not null default true,
  add column if not exists replaced_by_candidate_id uuid references public.candidates (id) on delete set null,
  add column if not exists replaced_at timestamptz,
  add column if not exists replaced_reason text;

create index if not exists candidates_is_active_idx
  on public.candidates (is_active);

create index if not exists candidates_replaced_by_candidate_id_idx
  on public.candidates (replaced_by_candidate_id);

create table if not exists public.candidate_cv_replacements (
  id bigint generated always as identity primary key,
  previous_candidate_id uuid not null references public.candidates (id) on delete cascade,
  replacement_candidate_id uuid not null references public.candidates (id) on delete cascade,
  previous_status text not null,
  new_status text not null default 'New',
  matched_on text not null
    constraint candidate_cv_replacements_matched_on_check
      check (matched_on in ('email', 'phone', 'email_or_phone')),
  previous_cv_storage_path text,
  previous_filename text,
  previous_mime_type text,
  previous_cv_uploaded_at timestamptz,
  replaced_by_email text,
  replaced_at timestamptz not null default now()
);

create index if not exists candidate_cv_replacements_replacement_candidate_idx
  on public.candidate_cv_replacements (replacement_candidate_id, replaced_at desc);

create index if not exists candidate_cv_replacements_previous_candidate_idx
  on public.candidate_cv_replacements (previous_candidate_id);

alter table public.candidate_cv_replacements enable row level security;

drop policy if exists candidate_cv_replacements_admin_select on public.candidate_cv_replacements;
create policy candidate_cv_replacements_admin_select
  on public.candidate_cv_replacements for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin is true
    )
  );

drop policy if exists candidate_cv_replacements_admin_insert on public.candidate_cv_replacements;
create policy candidate_cv_replacements_admin_insert
  on public.candidate_cv_replacements for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin is true
    )
  );

drop policy if exists candidate_cv_replacements_admin_update on public.candidate_cv_replacements;
create policy candidate_cv_replacements_admin_update
  on public.candidate_cv_replacements for update to authenticated
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

drop policy if exists candidate_cv_replacements_admin_delete on public.candidate_cv_replacements;
create policy candidate_cv_replacements_admin_delete
  on public.candidate_cv_replacements for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin is true
    )
  );
