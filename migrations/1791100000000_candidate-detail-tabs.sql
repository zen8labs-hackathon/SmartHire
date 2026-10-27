-- Up Migration

-- Recruiter overrides of the AI verdict for one requirement. Layered over
-- jd_match_rationale at read time; the AI result itself is never rewritten.
-- requirement_key = job_requirements.id (text) or the requirement text for
-- legacy rationales.
CREATE TABLE candidate_criterion_overrides (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_applied_id uuid NOT NULL REFERENCES campaign_applied (id) ON DELETE CASCADE,
  requirement_key text NOT NULL,
  verdict text NOT NULL CHECK (verdict IN ('met', 'partial', 'missing', 'unclear')),
  original_verdict text CHECK (original_verdict IN ('met', 'partial', 'missing', 'unclear')),
  reason text CHECK (char_length(reason) <= 2000),
  author_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX candidate_criterion_overrides_live_idx
  ON candidate_criterion_overrides (campaign_applied_id, requirement_key)
  WHERE deleted_at IS NULL;

-- Append-only log of pipeline moves (history starts at deploy time).
CREATE TABLE candidate_stage_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_applied_id uuid NOT NULL REFERENCES campaign_applied (id) ON DELETE CASCADE,
  from_stage_mapping_id uuid,
  from_sub_state_id uuid,
  to_stage_mapping_id uuid,
  to_sub_state_id uuid,
  reason text,
  by_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX candidate_stage_history_app_idx
  ON candidate_stage_history (campaign_applied_id, at DESC);

ALTER TABLE campaign_applied ADD COLUMN entered_stage_at timestamptz;

-- Down Migration

ALTER TABLE campaign_applied DROP COLUMN IF EXISTS entered_stage_at;
DROP TABLE IF EXISTS candidate_stage_history;
DROP TABLE IF EXISTS candidate_criterion_overrides;
