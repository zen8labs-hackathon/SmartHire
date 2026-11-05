-- Up Migration
-- Candidates 2 foundation: rehire eligibility, tags, reminder, consent, end reason, timeline events.

ALTER TABLE candidates
  ADD COLUMN rehire_status text CHECK (rehire_status IN ('eligible', 'ask', 'not_eligible')),
  ADD COLUMN rehire_reason text,
  ADD COLUMN rehire_by uuid REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN rehire_at timestamptz,
  ADD COLUMN tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN consent_date date,
  ADD COLUMN consent_channel text,
  ADD COLUMN consent_recorded_by uuid REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE campaign_applied
  ADD COLUMN end_reason text CHECK (end_reason IN
    ('skills', 'salary', 'culture', 'withdrew', 'noshow', 'closed', 'other')),
  ADD COLUMN end_note text,
  ADD COLUMN ended_at timestamptz,
  ADD CONSTRAINT campaign_applied_end_other_needs_note
    CHECK (end_reason IS DISTINCT FROM 'other' OR NULLIF(btrim(end_note), '') IS NOT NULL);

CREATE TABLE candidate_reminders (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  candidate_id uuid NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
  due_date date NOT NULL,
  note text NOT NULL DEFAULT '',
  owner_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  done_at timestamptz
);
-- One active reminder per candidate.
CREATE UNIQUE INDEX candidate_reminders_active_uniq
  ON candidate_reminders (candidate_id) WHERE done_at IS NULL;

CREATE TABLE candidate_timeline_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  candidate_id uuid NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
  campaign_applied_id uuid REFERENCES campaign_applied (id) ON DELETE SET NULL,
  type text NOT NULL,
  title text NOT NULL,
  detail text,
  by_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX candidate_timeline_events_candidate_idx
  ON candidate_timeline_events (candidate_id, at DESC);

-- Down Migration

DROP TABLE IF EXISTS candidate_timeline_events;
DROP TABLE IF EXISTS candidate_reminders;
ALTER TABLE campaign_applied
  DROP CONSTRAINT IF EXISTS campaign_applied_end_other_needs_note,
  DROP COLUMN IF EXISTS end_reason,
  DROP COLUMN IF EXISTS end_note,
  DROP COLUMN IF EXISTS ended_at;
ALTER TABLE candidates
  DROP COLUMN IF EXISTS rehire_status,
  DROP COLUMN IF EXISTS rehire_reason,
  DROP COLUMN IF EXISTS rehire_by,
  DROP COLUMN IF EXISTS rehire_at,
  DROP COLUMN IF EXISTS tags,
  DROP COLUMN IF EXISTS consent_date,
  DROP COLUMN IF EXISTS consent_channel,
  DROP COLUMN IF EXISTS consent_recorded_by;
