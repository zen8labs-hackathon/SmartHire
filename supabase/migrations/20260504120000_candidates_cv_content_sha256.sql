-- Fingerprint normalized CV plain text for duplicate detection (same document
-- even when parsed email/phone differ or are missing).

alter table public.candidates
  add column if not exists cv_content_sha256 text;

create index if not exists candidates_cv_content_sha256_active_idx
  on public.candidates (cv_content_sha256)
  where is_active is true and cv_content_sha256 is not null;

-- Allow storing how the duplicate was detected when user replaces.
alter table public.candidate_cv_replacements
  drop constraint if exists candidate_cv_replacements_matched_on_check;

alter table public.candidate_cv_replacements
  add constraint candidate_cv_replacements_matched_on_check
  check (matched_on in ('email', 'phone', 'email_or_phone', 'cv_content'));
