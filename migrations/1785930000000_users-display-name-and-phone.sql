-- Up Migration

-- display_name is populated from the real Microsoft Graph profile at SSO
-- provisioning time (see app/api/auth/azure/callback/route.ts), with a
-- self-service override in the account modal. phone is self-service only --
-- there's no source for it in the Graph profile.
ALTER TABLE users
  ADD COLUMN display_name text,
  ADD COLUMN phone text;

-- Down Migration

ALTER TABLE users
  DROP COLUMN display_name,
  DROP COLUMN phone;
