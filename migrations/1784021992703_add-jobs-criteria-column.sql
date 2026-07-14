-- Up Migration

-- Free-text hiring criteria (e.g. "minimum 4 years experience, IELTS 7.0+")
-- entered manually at JD-creation time. Not AI-extracted -- kept separate
-- from the JD document fields so it can be injected verbatim into future
-- AI prompts (JD matching / resume scoring) without depending on parsing.
ALTER TABLE jobs ADD COLUMN criteria text;

-- Down Migration

ALTER TABLE jobs DROP COLUMN IF EXISTS criteria;
