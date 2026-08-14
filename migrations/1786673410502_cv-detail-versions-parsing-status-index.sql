-- Up Migration

-- Active Candidates parsing-status filter (`cv.parsing_status = $n`) at ~100k CV
-- scale. Low-cardinality equality filter; index still helps planner when combined
-- with other predicates / when scanning failed rows preferentially.
CREATE INDEX cv_detail_versions_parsing_status_idx
  ON cv_detail_versions (parsing_status);

-- Down Migration

DROP INDEX IF EXISTS cv_detail_versions_parsing_status_idx;
