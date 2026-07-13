-- Up Migration

-- Merges job_openings + job_descriptions (DB7X2K item 1). No more Draft status: a job is
-- always created with its full fields in one step.
CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  position text NOT NULL,
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Done', 'Hiring', 'Pending', 'Closed')),
  department text,
  employment_status text,
  work_location text,
  reporting text,
  role_overview text,
  duties_and_responsibilities text,
  experience_requirements_must_have text,
  experience_requirements_nice_to_have text,
  what_we_offer text,
  level text,
  headcount integer,
  hire_type text,
  project_info text,
  team_size text,
  language_requirements text,
  career_development text,
  other_requirements text,
  salary_range text,
  project_allowances text,
  interview_process text,
  start_date date,
  end_date date,
  hiring_deadline date,
  jd_storage_path text,
  jd_original_filename text,
  jd_mime_type text,
  update_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL,
  deleted_at timestamptz
);

CREATE INDEX jobs_status_idx ON jobs (status);

-- Down Migration

DROP TABLE IF EXISTS jobs;
