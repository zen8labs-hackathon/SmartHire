-- Allow editing interview notes: the author of a note, or an admin, may update its body.
-- Previously candidate_interview_notes was append-only (no update policy at all).

alter table public.candidate_interview_notes
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists candidate_interview_notes_set_updated_at
  on public.candidate_interview_notes;
create trigger candidate_interview_notes_set_updated_at
  before update on public.candidate_interview_notes
  for each row execute procedure public.set_updated_at();

drop policy if exists candidate_interview_notes_owner_or_admin_update
  on public.candidate_interview_notes;
create policy candidate_interview_notes_owner_or_admin_update
  on public.candidate_interview_notes for update to authenticated
  using (
    author_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin is true
    )
  )
  with check (
    author_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin is true
    )
  );
