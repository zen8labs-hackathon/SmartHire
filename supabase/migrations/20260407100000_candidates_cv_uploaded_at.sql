-- Explicit CV upload timestamp (distinct from parsing / row updates).

alter table public.candidates
  add column if not exists cv_uploaded_at timestamptz;

update public.candidates
  set cv_uploaded_at = created_at
  where cv_uploaded_at is null;

alter table public.candidates
  alter column cv_uploaded_at set default now();

alter table public.candidates
  alter column cv_uploaded_at set not null;

create index if not exists candidates_cv_uploaded_at_idx
  on public.candidates (cv_uploaded_at desc);
