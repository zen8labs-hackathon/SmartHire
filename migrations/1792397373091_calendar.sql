-- Up Migration

-- 1. candidate_schedules: session details + reasons + flags
ALTER TABLE candidate_schedules
  ADD COLUMN mode text NOT NULL DEFAULT 'online' CHECK (mode IN ('online', 'office')),
  ADD COLUMN meeting_link text CHECK (meeting_link IS NULL OR char_length(meeting_link) <= 2000),
  ADD COLUMN note text CHECK (note IS NULL OR char_length(note) <= 2000),
  ADD COLUMN cancel_reason text CHECK (cancel_reason IS NULL OR char_length(cancel_reason) <= 1000),
  ADD COLUMN reschedule_reason text CHECK (reschedule_reason IS NULL OR char_length(reschedule_reason) <= 1000),
  ADD COLUMN canceled_by uuid REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN canceled_at timestamptz,
  ADD COLUMN evaluation_due_at timestamptz,          -- scheduled_at + duration + 24h, set by app on insert/reschedule
  ADD COLUMN no_interviewer_flag boolean NOT NULL DEFAULT false,  -- all interviewers declined
  ADD COLUMN soft_conflicts_acknowledged boolean NOT NULL DEFAULT false;

-- Backfill due date for existing rows
UPDATE candidate_schedules
   SET evaluation_due_at = scheduled_at + make_interval(mins => COALESCE(duration_minutes, 60)) + interval '24 hours'
 WHERE evaluation_due_at IS NULL;

-- Calendar feed is range-by-time across all candidates
CREATE INDEX candidate_schedules_scheduled_at_idx ON candidate_schedules (scheduled_at)
  WHERE status IN ('Scheduled', 'Confirmed', 'Completed', 'NoShow');

-- 2. candidate_schedule_interviewers: per-interviewer decline + evaluation status
ALTER TABLE candidate_schedule_interviewers
  ADD COLUMN declined_at timestamptz,
  ADD COLUMN decline_reason text CHECK (decline_reason IS NULL OR char_length(decline_reason) <= 500),
  ADD COLUMN evaluation_submitted_at timestamptz,     -- gates AI-match visibility + overdue reminders
  ADD COLUMN overdue_notified_at timestamptz;         -- idempotency for overdue reminder

-- 3. busy_blocks: personal busy time (times are minutes-of-day in GMT+7)
CREATE TABLE busy_blocks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  owner_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  start_date date NOT NULL,
  all_day boolean NOT NULL DEFAULT false,
  from_min smallint,                                  -- 480..1140, step 30 (08:00-19:00)
  to_min smallint,
  repeat text NOT NULL DEFAULT 'none' CHECK (repeat IN ('none', 'weekdays', 'weekly')),
  until_date date,
  note varchar(200),
  removed_dates date[] NOT NULL DEFAULT '{}',         -- single occurrences deleted from a series
  series_parent_id uuid REFERENCES busy_blocks (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT busy_blocks_time_chk CHECK (
    (all_day AND from_min IS NULL AND to_min IS NULL)
    OR (NOT all_day AND from_min IS NOT NULL AND to_min IS NOT NULL
        AND from_min >= 480 AND to_min <= 1140 AND from_min < to_min
        AND from_min % 30 = 0 AND to_min % 30 = 0)),
  CONSTRAINT busy_blocks_repeat_chk CHECK (
    (repeat = 'none' AND until_date IS NULL)
    OR (repeat <> 'none' AND until_date IS NOT NULL
        AND until_date >= start_date
        AND until_date <= start_date + interval '3 months'))
);

CREATE INDEX busy_blocks_owner_idx ON busy_blocks (owner_id, start_date) WHERE deleted_at IS NULL;

-- 4. company_settings: key/value, seeded with company working hours
CREATE TABLE company_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO company_settings (key, value) VALUES
  ('working_hours', '{"start": 510, "end": 1050, "days": [1,2,3,4,5]}'::jsonb);  -- 08:30-17:30 Mon-Fri; app validates 360..1260

-- Down Migration

DROP TABLE IF EXISTS company_settings;
DROP TABLE IF EXISTS busy_blocks;
DROP INDEX IF EXISTS candidate_schedules_scheduled_at_idx;
ALTER TABLE candidate_schedule_interviewers
  DROP COLUMN IF EXISTS overdue_notified_at,
  DROP COLUMN IF EXISTS evaluation_submitted_at,
  DROP COLUMN IF EXISTS decline_reason,
  DROP COLUMN IF EXISTS declined_at;
ALTER TABLE candidate_schedules
  DROP COLUMN IF EXISTS soft_conflicts_acknowledged,
  DROP COLUMN IF EXISTS no_interviewer_flag,
  DROP COLUMN IF EXISTS evaluation_due_at,
  DROP COLUMN IF EXISTS canceled_at,
  DROP COLUMN IF EXISTS canceled_by,
  DROP COLUMN IF EXISTS reschedule_reason,
  DROP COLUMN IF EXISTS cancel_reason,
  DROP COLUMN IF EXISTS note,
  DROP COLUMN IF EXISTS meeting_link,
  DROP COLUMN IF EXISTS mode;
