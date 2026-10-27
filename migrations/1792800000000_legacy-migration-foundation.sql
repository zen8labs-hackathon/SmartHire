-- Up Migration

-- 1 = legacy flow (pre Position Management 2), 2 = new flow. Every existing job
-- is backfilled to 1 by the DEFAULT; jobs created by Position Management 2 write 2.
ALTER TABLE jobs
  ADD COLUMN flow_version smallint NOT NULL DEFAULT 1
  CHECK (flow_version IN (1, 2));

-- Audit / snapshot / rollback record of per-job legacy -> new conversions.
CREATE TABLE legacy_migrations (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type  text NOT NULL,
  entity_id    text NOT NULL,
  status       text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'previewed', 'applied', 'skipped', 'failed', 'rolled_back')),
  plan         jsonb,
  decision     jsonb,
  snapshot     jsonb,
  confirmed_by uuid REFERENCES users (id) ON DELETE SET NULL,
  confirmed_at timestamptz,
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX legacy_migrations_entity_idx
  ON legacy_migrations (entity_type, entity_id, created_at DESC);

INSERT INTO permissions (id, description) VALUES
  ('migration.manage', 'Convert legacy jobs to the new flow (Migration Center)');

INSERT INTO role_permissions (role, permission_id) VALUES
  ('admin', 'migration.manage'),
  ('hr', 'migration.manage');

-- Down Migration

DELETE FROM role_permissions WHERE permission_id = 'migration.manage';
DELETE FROM group_permissions WHERE permission_id = 'migration.manage';
DELETE FROM permissions WHERE id = 'migration.manage';
DROP TABLE IF EXISTS legacy_migrations;
ALTER TABLE jobs DROP COLUMN IF EXISTS flow_version;
