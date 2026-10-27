-- Up Migration

-- Probation extension (gia hạn): the latest agreed end date of an extended
-- probation plus how many times it was extended. Each extension is also
-- logged (with its reason) in candidate_stage_history.
ALTER TABLE campaign_applied
  ADD COLUMN probation_extended_until date,
  ADD COLUMN probation_extension_count integer NOT NULL DEFAULT 0;

-- Down Migration

ALTER TABLE campaign_applied
  DROP COLUMN IF EXISTS probation_extension_count,
  DROP COLUMN IF EXISTS probation_extended_until;
