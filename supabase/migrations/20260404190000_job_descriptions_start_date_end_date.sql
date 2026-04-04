alter table public.job_descriptions
  add column if not exists start_date date;
alter table public.job_descriptions
  add column if not exists end_date date;
