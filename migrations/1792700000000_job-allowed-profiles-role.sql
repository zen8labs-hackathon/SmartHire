-- Up Migration

-- A person grant on a position is either a recruiter or an interviewer.
-- Existing grants stay recruiters (current behaviour).
ALTER TABLE job_allowed_profiles
  ADD COLUMN role text NOT NULL DEFAULT 'recruiter'
  CHECK (role IN ('recruiter', 'interviewer'));

-- Down Migration

ALTER TABLE job_allowed_profiles DROP COLUMN IF EXISTS role;
