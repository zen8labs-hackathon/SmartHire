-- Up Migration

-- PF6X9R perf audit (2026-07-14): listRecentCvDetailVersionsForAdmin (admin dashboard
-- "Recent Activities") does `ORDER BY cv.created_at DESC LIMIT n` with no WHERE clause,
-- but cv_detail_versions has no index covering created_at -- EXPLAIN ANALYZE on 5605 seeded
-- rows confirmed a full Seq Scan + join across cv_detail_versions/campaign_applied/candidates/
-- jobs before sorting and taking the top 5 (12.76ms at this scale, cost scales with full table
-- size, not LIMIT). This index lets the planner satisfy the ORDER BY ... LIMIT directly.
CREATE INDEX cv_detail_versions_created_at_idx ON cv_detail_versions (created_at DESC);

-- Down Migration

DROP INDEX IF EXISTS cv_detail_versions_created_at_idx;