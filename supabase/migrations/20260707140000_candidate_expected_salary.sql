-- Candidate's expected salary: entered by HR at CV creation (free text — ranges,
-- currency, "negotiable", etc. all vary). Deliberately NOT added to
-- ADMIN_CANDIDATES_CORE_COLUMNS / the shared list+detail selects in
-- lib/candidates/admin-select.ts — visibility is restricted in application code
-- to HR/admin and chapter heads (see the evaluation page, which fetches this
-- column only via its own targeted, permission-gated query). It must also never
-- be included in the evaluation PDF snapshot, since that PDF becomes a
-- permanently public, unauthenticated link via the preview token.

alter table public.candidates
  add column if not exists expected_salary text;

comment on column public.candidates.expected_salary is
  'Free-text expected salary entered by HR at CV creation. Not part of the shared candidate select constants — fetch explicitly and only expose to HR/admin or a chapter head of a chapter granted on the JD. Never include in evaluation PDF snapshots (publicly shareable via preview token).';
