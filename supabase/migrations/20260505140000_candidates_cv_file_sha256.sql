-- SHA-256 of raw uploaded file bytes (stable duplicate signal for same file re-upload).

alter table public.candidates
  add column if not exists cv_file_sha256 text;

create index if not exists candidates_cv_file_sha256_active_idx
  on public.candidates (cv_file_sha256)
  where is_active is true and cv_file_sha256 is not null;

alter table public.candidate_cv_replacements
  drop constraint if exists candidate_cv_replacements_matched_on_check;

alter table public.candidate_cv_replacements
  add constraint candidate_cv_replacements_matched_on_check
  check (matched_on in ('email', 'phone', 'email_or_phone', 'cv_content', 'cv_file'));
