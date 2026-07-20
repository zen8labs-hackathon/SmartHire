-- Up Migration

-- Replaces job_description_viewers + job_description_viewer_chapters (DB7X2K item 5). Kept as
-- 2 plain FK tables rather than 1 polymorphic grantee_type/grantee_id table -- a polymorphic
-- table would need every RLS/authorization check to branch on type, which is what caused the
-- deny-all bug this design replaces.
CREATE TABLE job_allowed_profiles (
  job_id uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  granted_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, profile_id)
);

CREATE INDEX job_allowed_profiles_profile_idx ON job_allowed_profiles (profile_id);

CREATE TABLE job_allowed_chapters (
  job_id uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL REFERENCES chapters (id) ON DELETE CASCADE,
  granted_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, chapter_id)
);

CREATE INDEX job_allowed_chapters_chapter_idx ON job_allowed_chapters (chapter_id);

-- Per-job evaluation template defined by the chapter head (DB7X2K item 8) -- replaces the old
-- single system-wide candidate_evaluation_template singleton row.
CREATE TABLE job_evaluate_templates (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id uuid NOT NULL UNIQUE REFERENCES jobs (id) ON DELETE CASCADE,
  storage_path text,
  original_filename text,
  mime_type text,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL
);

-- Down Migration

DROP TABLE IF EXISTS job_evaluate_templates;
DROP TABLE IF EXISTS job_allowed_chapters;
DROP TABLE IF EXISTS job_allowed_profiles;
