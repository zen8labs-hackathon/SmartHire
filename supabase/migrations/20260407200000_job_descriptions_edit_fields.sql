-- Add detailed recruitment info fields to job_descriptions table.
-- These fields are managed via the Edit JD modal and cover structured
-- hiring intake information collected from hiring managers.

alter table public.job_descriptions
  add column if not exists level                  varchar(100),
  add column if not exists headcount              integer,
  add column if not exists hire_type              varchar(50),
  add column if not exists project_info           text,
  add column if not exists team_size              text,
  add column if not exists language_requirements  text,
  add column if not exists career_development     text,
  add column if not exists other_requirements     text,
  add column if not exists salary_range           varchar(255),
  add column if not exists project_allowances     text,
  add column if not exists interview_process      text,
  add column if not exists hiring_deadline        date;
