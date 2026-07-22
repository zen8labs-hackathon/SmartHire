-- Up Migration

-- cv_detail_versions_created_at_idx (migrations/1784021823799) existed solely to satisfy
-- listRecentCvDetailVersionsForAdmin's `ORDER BY cv.created_at DESC LIMIT n`. That query now
-- sorts by `cv.id DESC` instead (uuidv7/identity ids are already time-ordered), which the
-- primary key index already covers via a backward index scan -- this index is now dead weight
-- (extra write cost on every insert, no reads).
DROP INDEX IF EXISTS cv_detail_versions_created_at_idx;

-- Down Migration

CREATE INDEX cv_detail_versions_created_at_idx ON cv_detail_versions (created_at DESC);