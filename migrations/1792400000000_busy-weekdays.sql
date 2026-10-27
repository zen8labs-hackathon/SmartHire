-- Up Migration

-- Weekly busy blocks pick their own weekdays (ISO 1=Mon..7=Sun). Legacy weekly
-- rows keep an empty array and fall back to the weekday of start_date.
ALTER TABLE busy_blocks
  ADD COLUMN days smallint[] NOT NULL DEFAULT '{}',
  ADD CONSTRAINT busy_blocks_days_chk CHECK (
    days <@ ARRAY[1,2,3,4,5,6,7]::smallint[]
    AND (repeat = 'weekly' OR cardinality(days) = 0)
  );

-- Down Migration

ALTER TABLE busy_blocks
  DROP CONSTRAINT IF EXISTS busy_blocks_days_chk,
  DROP COLUMN IF EXISTS days;
