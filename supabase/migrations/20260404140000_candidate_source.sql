-- Candidate sourcing: HR-selected channel + optional free text when "Other".

alter table public.candidates
  add column if not exists source text;

alter table public.candidates
  add column if not exists source_other text;

update public.candidates
set source = 'Other'
where source is null;

alter table public.candidates
  alter column source set default 'Other',
  alter column source set not null;

alter table public.candidates
  drop constraint if exists candidates_source_check;

alter table public.candidates
  add constraint candidates_source_check
  check (
    source in ('LinkedIn', 'TopCV', 'ITViec', 'Facebook', 'TopDev', 'Other')
  );

alter table public.candidates
  drop constraint if exists candidates_source_other_rules;

alter table public.candidates
  add constraint candidates_source_other_rules
  check (
    (source = 'Other' or source_other is null)
    and (source_other is null or length(source_other) <= 500)
  );
