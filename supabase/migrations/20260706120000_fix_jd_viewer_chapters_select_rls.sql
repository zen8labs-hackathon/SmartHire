-- Fix: job_description_viewer_chapters had a deny-all policy (using (false)) that
-- blocked SELECT for the `authenticated` role entirely. Postgres RLS applies even to
-- subqueries run from another table's policy, so the chapter-grant EXISTS join inside
-- job_descriptions_recruiter_select / job_openings_recruiter_select / candidates_staff_select /
-- candidate_evaluation_reviews_staff_select* / candidate_interview_notes_staff_insert always
-- returned 0 rows — chapter recruiters could never see a JD granted via chapter, only via
-- an individual job_description_viewers grant.
--
-- Replace the deny-all with a scoped SELECT policy: a user may read a viewer-chapter
-- grant row only if they belong to that chapter (mirrors job_description_viewers_select_own,
-- which restricts to the caller's own user_id). Writes remain admin/service-role only
-- (no insert/update/delete policy for `authenticated` = implicit deny).

drop policy if exists job_description_viewer_chapters_deny
  on public.job_description_viewer_chapters;

create policy job_description_viewer_chapters_select_own
  on public.job_description_viewer_chapters for select to authenticated
  using (
    exists (
      select 1 from public.profile_chapters pc
      where pc.chapter_id = job_description_viewer_chapters.chapter_id
        and pc.profile_id = auth.uid()
    )
  );
