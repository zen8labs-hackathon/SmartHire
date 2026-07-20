-- Up Migration

-- Self-built auth (JW4T8X, per IN9X4Q decision 2). `password_hash` is nullable because a
-- future SSO-only account (AZ4S9K, out of scope here) never sets one -- the app must not assume
-- every row has a password. `sso_provider`/`sso_subject_id` are added now (also nullable) so the
-- schema doesn't need another migration when AZ4S9K lands; matching happens on the IdP's stable
-- subject id, not email (email is not trustworthy for identity matching -- see AZ4S9K planning).
-- Decided inline on `users` rather than a separate `external_identities` table: this app has
-- exactly one current/planned provider (Microsoft) and at most one SSO identity per user: if that
-- changes, splitting it out is a later migration, not a speculative one now.
ALTER TABLE users
  ADD COLUMN password_hash text,
  ADD COLUMN sso_provider text,
  ADD COLUMN sso_subject_id text;

CREATE UNIQUE INDEX users_sso_identity_idx
  ON users (sso_provider, sso_subject_id)
  WHERE sso_provider IS NOT NULL;

-- Refresh tokens back the access+refresh session model (short-lived signed access JWT, verified
-- without a DB hit; longer-lived opaque refresh token here so an admin can revoke a session
-- before its refresh token's natural expiry -- a pure-JWT design has no revocation path short of
-- waiting out the token's lifetime). `token_hash` stores a SHA-256 hash of the raw token, not the
-- token itself, so a DB read/leak doesn't hand out valid sessions -- same principle as
-- `password_hash`. `user_agent`/`ip` are for audit only, never used in the auth decision.
CREATE TABLE refresh_tokens (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  user_agent text,
  ip text
);

CREATE UNIQUE INDEX refresh_tokens_token_hash_idx ON refresh_tokens (token_hash);
-- Supports both "list a user's active sessions" and bulk revoke-on-password-change/delete.
CREATE INDEX refresh_tokens_user_id_idx ON refresh_tokens (user_id) WHERE revoked_at IS NULL;

-- Down Migration

DROP TABLE IF EXISTS refresh_tokens;
DROP INDEX IF EXISTS users_sso_identity_idx;
ALTER TABLE users
  DROP COLUMN IF EXISTS sso_subject_id,
  DROP COLUMN IF EXISTS sso_provider,
  DROP COLUMN IF EXISTS password_hash;
