-- Up Migration

-- One row per candidate_schedules -- tracks the single Microsoft Graph
-- calendar event created for that schedule (application-permission flow,
-- same MS_GRAPH_* app registration as lib/microsoft/mail.ts, organizer
-- mailbox = email_settings.default_sender). Kept separate from
-- candidate_schedules because this is an external-integration sync state
-- (pending/failed/retry), not business data -- mirrors the pattern already
-- used for email_messages/email_schedules.
CREATE TABLE candidate_schedule_calendar_syncs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  schedule_id bigint NOT NULL UNIQUE REFERENCES candidate_schedules (id) ON DELETE CASCADE,
  graph_event_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'synced', 'failed', 'cancelled')),
  error_message text,
  retry_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Drives the retry poller's query (failed rows still worth retrying).
CREATE INDEX candidate_schedule_calendar_syncs_status_idx
  ON candidate_schedule_calendar_syncs (status) WHERE status IN ('pending', 'failed');

-- Per-interviewer response to the calendar invite -- distinct from the sync
-- table above, which tracks the single Graph event as a whole. Column left
-- room for by the original candidate_schedule_interviewers migration
-- comment ("leaves room for per-interviewer RSVP/feedback later").
ALTER TABLE candidate_schedule_interviewers
  ADD COLUMN rsvp_status text NOT NULL DEFAULT 'none'
    CHECK (rsvp_status IN ('none', 'accepted', 'declined', 'tentative'));

-- Down Migration

ALTER TABLE candidate_schedule_interviewers DROP COLUMN rsvp_status;
DROP TABLE IF EXISTS candidate_schedule_calendar_syncs;
