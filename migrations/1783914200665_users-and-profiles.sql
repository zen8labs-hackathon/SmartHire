-- Up Migration

-- Single identity+profile table (merged 2026-07-13, task JW4T8X). `users`/`profiles` were
-- originally split to mirror Supabase's auth.users/public.profiles pattern -- that split only
-- existed because Supabase's auth.users is owned by GoTrue and off-limits to app schema changes.
-- That constraint doesn't apply once auth is self-built (IN9X4Q decision 2): profiles.id was
-- always a 1:1 shadow of users.id, and invite-only signup means no user ever exists without a
-- profile, so keeping them split was pure overhead. Auth-credential columns (password_hash,
-- sso_provider, sso_subject_id) are added by JW4T8X's own migration when that task is
-- implemented -- not here, this migration only merges the shape DB7X2K already designed.
CREATE TYPE profile_role AS ENUM ('admin', 'hr', 'recruiter', 'none');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  email text NOT NULL,
  username text NOT NULL,
  role profile_role NOT NULL DEFAULT 'none',
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT users_username_format CHECK (username ~ '^[a-z0-9_]{3,30}$')
);

CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email));
CREATE UNIQUE INDEX users_username_lower_idx ON users (lower(username));

CREATE TABLE chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chapters_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT chapters_name_unique UNIQUE (name)
);

-- profile_id still names "which user" here (not renamed to user_id) to keep this edit scoped to
-- the users/profiles merge itself -- a column-naming cleanup across profile_chapters and
-- job_allowed_profiles is a separate, not-yet-requested change.
CREATE TABLE profile_chapters (
  profile_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL REFERENCES chapters (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('head', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, chapter_id)
);

-- Down Migration

DROP TABLE IF EXISTS profile_chapters;
DROP TABLE IF EXISTS chapters;
DROP TABLE IF EXISTS users;
DROP TYPE IF EXISTS profile_role;
