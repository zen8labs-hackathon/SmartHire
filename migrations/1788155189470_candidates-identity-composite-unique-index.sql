-- Up Migration

-- Loosens the candidate identity constraint from "email unique on its own AND
-- phone unique on its own" (migration 1784000412189) to "the (email, phone)
-- PAIR is unique". Two live candidates may now share an email as long as their
-- phone differs, or share a phone as long as their email differs -- only an
-- exact match on both is rejected.
--
-- email / phone each keep a plain (non-unique) lookup index for
-- findCandidatesByContact / findCandidatesByDedupeSignals, which query them
-- independently (OR, not AND).
--
-- No data reconciliation needed: the old constraint was strictly stronger, so
-- nothing that satisfied it can violate the composite pair uniqueness.

DROP INDEX IF EXISTS candidates_email_unique_idx;
DROP INDEX IF EXISTS candidates_phone_unique_idx;

CREATE INDEX candidates_email_idx ON candidates (lower(email));
CREATE INDEX candidates_phone_idx ON candidates (phone);

-- Partial (excludes soft-deleted + rows missing either half): a soft-deleted
-- candidate never blocks reuse of its email+phone, and a half-identified row
-- (email or phone still NULL, e.g. a blank candidate created at CV-upload time
-- before parsing) is never in the index.
CREATE UNIQUE INDEX candidates_identity_unique_idx
  ON candidates (lower(email), phone)
  WHERE deleted_at IS NULL AND email IS NOT NULL AND phone IS NOT NULL;

-- Down Migration

DROP INDEX IF EXISTS candidates_identity_unique_idx;
DROP INDEX IF EXISTS candidates_email_idx;
DROP INDEX IF EXISTS candidates_phone_idx;

CREATE UNIQUE INDEX candidates_email_unique_idx
  ON candidates (lower(email))
  WHERE deleted_at IS NULL AND email IS NOT NULL;

CREATE UNIQUE INDEX candidates_phone_unique_idx
  ON candidates (phone)
  WHERE deleted_at IS NULL AND phone IS NOT NULL;
