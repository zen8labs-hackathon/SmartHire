-- Up Migration

-- `users_email_lower_idx`/`users_username_lower_idx` (from the DB7X2K users/profiles merge)
-- were plain unique indexes covering every row, including soft-deleted ones -- so once a user
-- was soft-deleted (`softDeleteUser`), their email/username stayed permanently reserved. That
-- silently broke SSO self-provisioning (`createSsoUser` in the Azure callback route): a
-- soft-deleted user signing back in via SSO hit a unique violation on INSERT, which
-- `isUniqueViolation` swallows (that catch is meant for a real "different SSO identity already
-- owns this email" race), so the callback fell through to `sso-not-invited` instead of creating
-- a fresh account. Same gap existed for admin/HR manually re-inviting a deleted user's email
-- (`createUser`), except unhandled there so it surfaced as a raw 500. Made partial to match the
-- same fix already applied to `candidates` in `1784000412189_add-candidates-identity-unique-index.sql`.
--
-- `users_sso_identity_idx` (added by `1783920057258_users-auth-credentials.sql`) has the same
-- gap for the (sso_provider, sso_subject_id) pair: it was partial on `sso_provider IS NOT NULL`
-- but not on `deleted_at IS NULL`, so a soft-deleted SSO user hit the same unique-violation ->
-- `sso-not-invited` dead end on their next sign-in. Recreated with the `deleted_at IS NULL`
-- condition added.
DROP INDEX IF EXISTS users_email_lower_idx;
DROP INDEX IF EXISTS users_username_lower_idx;
DROP INDEX IF EXISTS users_sso_identity_idx;

CREATE UNIQUE INDEX users_email_lower_idx
  ON users (lower(email))
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX users_username_lower_idx
  ON users (lower(username))
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX users_sso_identity_idx
  ON users (sso_provider, sso_subject_id)
  WHERE sso_provider IS NOT NULL AND deleted_at IS NULL;

-- Down Migration

DROP INDEX IF EXISTS users_email_lower_idx;
DROP INDEX IF EXISTS users_username_lower_idx;
DROP INDEX IF EXISTS users_sso_identity_idx;

CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email));
CREATE UNIQUE INDEX users_username_lower_idx ON users (lower(username));
CREATE UNIQUE INDEX users_sso_identity_idx
  ON users (sso_provider, sso_subject_id)
  WHERE sso_provider IS NOT NULL;
