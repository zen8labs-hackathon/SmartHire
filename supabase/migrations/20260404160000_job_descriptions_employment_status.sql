-- Employment type from JD document (e.g. Fulltime) — distinct from workflow status (Active/Draft/Closed).

alter table public.job_descriptions
  add column if not exists employment_status varchar(50);
