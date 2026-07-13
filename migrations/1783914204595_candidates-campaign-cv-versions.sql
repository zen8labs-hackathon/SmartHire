-- Up Migration

-- Splits the old single `candidates` row into 3 layers (DB7X2K item 2): person (candidates),
-- application (campaign_applied, 1 per candidate x job), and CV file version (cv_detail_versions,
-- immutable). skills/role/degree/education/experience_years on `candidates` are an aggregate
-- snapshot for pool search only -- AI matching always reads the per-version columns instead.
CREATE TABLE candidates (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  name text,
  email text,
  phone text,
  degree text,
  education text,
  role text,
  experience_years numeric,
  skills text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX candidates_email_idx ON candidates (lower(email));
CREATE INDEX candidates_phone_idx ON candidates (phone);
CREATE INDEX candidates_skills_idx ON candidates USING gin (skills);

-- active_cv_version_id -> cv_detail_versions(id) is added below via ALTER TABLE, once
-- cv_detail_versions exists (the two tables reference each other).
CREATE TABLE campaign_applied (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  candidate_id uuid NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  active_cv_version_id bigint,
  current_job_stage_mapping_id uuid REFERENCES job_stage_mappings (id),
  current_sub_state_id uuid REFERENCES pipeline_sub_stages (id),
  source text NOT NULL DEFAULT 'Other'
    CHECK (source IN ('LinkedIn', 'TopCV', 'ITViec', 'Facebook', 'TopDev', 'Other')),
  source_other text,
  expected_salary text,
  jd_match_score smallint CHECK (jd_match_score BETWEEN 0 AND 100),
  jd_match_status text NOT NULL DEFAULT 'pending',
  jd_match_error text,
  jd_match_rationale text,
  hired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX campaign_applied_candidate_idx ON campaign_applied (candidate_id);
CREATE INDEX campaign_applied_job_idx ON campaign_applied (job_id);

CREATE TABLE cv_detail_versions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_applied_id uuid NOT NULL REFERENCES campaign_applied (id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  source_event text NOT NULL
    CHECK (source_event IN ('initial_upload', 'file_replaced', 'manual_edit', 'restore')),
  cv_storage_path text,
  original_filename text,
  mime_type text,
  cv_file_sha256 text,
  cv_content_sha256 text,
  parsing_status text,
  parsing_error text,
  parsed_payload jsonb,
  skills text[] NOT NULL DEFAULT '{}',
  role text,
  degree text,
  education text,
  experience_years numeric,
  gpa text,
  english_level text,
  date_of_birth date,
  student_years text,
  jd_match_score smallint,
  jd_match_status text,
  jd_match_rationale text,
  jd_match_error text,
  jd_match_ai_score smallint,
  jd_match_formula_score smallint,
  jd_match_ai_weight numeric(3, 2),
  jd_match_formula_breakdown jsonb,
  jd_match_model text,
  jd_match_provider text,
  matched_on text CHECK (matched_on IN ('email', 'phone', 'email_or_phone', 'cv_content', 'cv_file')),
  change_summary text,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cv_detail_versions_campaign_version_unique UNIQUE (campaign_applied_id, version_number)
);

CREATE INDEX cv_detail_versions_campaign_idx
  ON cv_detail_versions (campaign_applied_id, version_number DESC);
CREATE INDEX cv_detail_versions_file_hash_idx
  ON cv_detail_versions (cv_file_sha256) WHERE cv_file_sha256 IS NOT NULL;
CREATE INDEX cv_detail_versions_content_hash_idx
  ON cv_detail_versions (cv_content_sha256) WHERE cv_content_sha256 IS NOT NULL;

ALTER TABLE campaign_applied
  ADD CONSTRAINT campaign_applied_active_cv_version_fk
  FOREIGN KEY (active_cv_version_id) REFERENCES cv_detail_versions (id) ON DELETE SET NULL;

-- Down Migration

ALTER TABLE campaign_applied DROP CONSTRAINT IF EXISTS campaign_applied_active_cv_version_fk;
DROP TABLE IF EXISTS cv_detail_versions;
DROP TABLE IF EXISTS campaign_applied;
DROP TABLE IF EXISTS candidates;
