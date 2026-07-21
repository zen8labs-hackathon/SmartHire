-- Up Migration

-- Permission catalog + role/group grants (app-layer RBAC). Job resource ACL stays in
-- job_allowed_profiles / job_allowed_chapters; those tables' *semantics* for chapter
-- grants are "chapter head only" (enforced in lib/authz), not every chapter member.

CREATE TABLE permissions (
  id text PRIMARY KEY,
  description text NOT NULL
);

CREATE TABLE role_permissions (
  role profile_role NOT NULL,
  permission_id text NOT NULL REFERENCES permissions (id) ON DELETE CASCADE,
  PRIMARY KEY (role, permission_id)
);

CREATE TABLE group_permissions (
  chapter_id uuid NOT NULL REFERENCES chapters (id) ON DELETE CASCADE,
  permission_id text NOT NULL REFERENCES permissions (id) ON DELETE CASCADE,
  PRIMARY KEY (chapter_id, permission_id)
);

CREATE INDEX group_permissions_permission_idx ON group_permissions (permission_id);

INSERT INTO permissions (id, description) VALUES
  ('admin.access', 'Enter the /admin application'),
  ('job.view', 'View jobs (scoped by job ACL for non-HR)'),
  ('job.manage', 'Create, update, and delete job descriptions and viewer grants'),
  ('candidate.view', 'View pipeline candidates on allowed jobs'),
  ('candidate.manage', 'Add or update candidates and pipeline moves on allowed jobs'),
  ('salary.view', 'View candidate expected salary (HR; chapter heads get this via job ACL)'),
  ('users.manage', 'Manage users, recruiting access, and chapters'),
  ('pipelines.manage', 'Manage pipeline stage setup');

-- admin + hr: full catalog
INSERT INTO role_permissions (role, permission_id)
SELECT r.role, p.id
FROM (VALUES ('admin'::profile_role), ('hr'::profile_role)) AS r (role)
CROSS JOIN permissions p;

-- recruiter: scoped job/candidate access; no salary.view / job.manage / setup
INSERT INTO role_permissions (role, permission_id) VALUES
  ('recruiter', 'admin.access'),
  ('recruiter', 'job.view'),
  ('recruiter', 'candidate.view'),
  ('recruiter', 'candidate.manage');

-- none: no role_permissions (dashboard-only unless chapter membership grants staff via app logic)

-- Down Migration

DROP TABLE IF EXISTS group_permissions;
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS permissions;
