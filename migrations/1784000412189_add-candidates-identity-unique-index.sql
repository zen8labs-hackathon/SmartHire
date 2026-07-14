-- Up Migration

-- Closes a known gap from the DB7X2K schema redesign: nothing enforced the
-- "1 person = 1 candidates row" invariant at the DB level, so two concurrent
-- writes (CV parse + manual profile edit, or two racing edits) that both set
-- the same email/phone onto different `candidates` rows could both succeed,
-- silently creating a duplicate person -- dedupe was app-layer-only
-- (`findCandidatesByDedupeSignals`), which only closes read-then-act races,
-- not write-write races. Partial (excludes soft-deleted + NULLs) so:
--   - `merge_candidates()` soft-deleting the loser (without clearing its
--     email/phone) never blocks reuse of that email/phone going forward.
--   - blank `candidates` rows created at CV-upload time (email/phone NULL
--     until parsed) never collide with each other.
-- Replaces the old plain lookup indexes, which are now redundant with these.
DROP INDEX IF EXISTS candidates_email_idx;
DROP INDEX IF EXISTS candidates_phone_idx;

CREATE UNIQUE INDEX candidates_email_unique_idx
  ON candidates (lower(email))
  WHERE deleted_at IS NULL AND email IS NOT NULL;

CREATE UNIQUE INDEX candidates_phone_unique_idx
  ON candidates (phone)
  WHERE deleted_at IS NULL AND phone IS NOT NULL;

-- Down Migration

DROP INDEX IF EXISTS candidates_email_unique_idx;
DROP INDEX IF EXISTS candidates_phone_unique_idx;

CREATE INDEX candidates_email_idx ON candidates (lower(email));
CREATE INDEX candidates_phone_idx ON candidates (phone);
