-- Up Migration

-- Replaces interview_at/onboarding_at/offered_at (DB7X2K item 3). No pipeline_phases /
-- phase_code: hired_at (campaign_applied) is instead set once a candidate reaches a sub-stage
-- with is_passed=true on the last stage (by sequence_number) of that job's pipeline.
CREATE TABLE candidate_schedules (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_applied_id uuid NOT NULL REFERENCES campaign_applied (id) ON DELETE CASCADE,
  job_stage_mapping_id uuid REFERENCES job_stage_mappings (id),
  round_label text,
  scheduled_at timestamptz NOT NULL,
  duration_minutes integer,
  location text,
  status text NOT NULL DEFAULT 'Scheduled'
    CHECK (status IN ('Scheduled', 'Confirmed', 'Rescheduled', 'Canceled', 'Completed', 'NoShow')),
  rescheduled_from_id bigint REFERENCES candidate_schedules (id),
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX candidate_schedules_campaign_idx ON candidate_schedules (campaign_applied_id, scheduled_at);

-- N-N interviewers per schedule, replacing the earlier candidate_schedules.interviewer_ids
-- uuid[] draft -- a join table indexes and leaves room for per-interviewer RSVP/feedback later.
CREATE TABLE candidate_schedule_interviewers (
  schedule_id bigint NOT NULL REFERENCES candidate_schedules (id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (schedule_id, profile_id)
);

CREATE INDEX candidate_schedule_interviewers_profile_idx ON candidate_schedule_interviewers (profile_id);

-- Merges candidate_interview_notes + pipeline_candidate_pre_interview_notes, distinguished by
-- `type`. HR notes only -- fully independent of the AI jd_match_* columns on campaign_applied.
CREATE TABLE candidate_notes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_applied_id uuid NOT NULL REFERENCES campaign_applied (id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('general', 'pre_interview', 'interview')),
  author_id uuid REFERENCES users (id) ON DELETE SET NULL,
  body text NOT NULL CHECK (char_length(body) <= 32000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX candidate_notes_campaign_idx ON candidate_notes (campaign_applied_id, created_at DESC);

-- Down Migration

DROP TABLE IF EXISTS candidate_notes;
DROP TABLE IF EXISTS candidate_schedule_interviewers;
DROP TABLE IF EXISTS candidate_schedules;
