-- Test admin for local / QA (fixed UUID). Skip if row already exists.
--
--   Email:    admin@smart-hire.test
--   Password: SmartHireTestAdmin!1
--
-- Do not rely on this account in production: delete the user or omit this migration
-- when applying to a public project.

create extension if not exists pgcrypto;

do $$
declare
  seed_id uuid := 'a1111111-1111-4111-8111-111111111111';
  seed_email text := 'admin@smart-hire.test';
  seed_password text := 'SmartHireTestAdmin!1';
  inst_id uuid;
begin
  if exists (select 1 from auth.users where id = seed_id or email = seed_email) then
    return;
  end if;

  select coalesce(
    (select id from auth.instances limit 1),
    '00000000-0000-0000-0000-000000000000'::uuid
  ) into inst_id;

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    recovery_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) values (
    inst_id,
    seed_id,
    'authenticated',
    'authenticated',
    seed_email,
    extensions.crypt(seed_password, extensions.gen_salt('bf'::text)),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  insert into auth.identities (
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    seed_id,
    seed_email,
    jsonb_build_object('sub', seed_id::text, 'email', seed_email),
    'email',
    now(),
    now(),
    now()
  );
end $$;

update public.profiles
set is_admin = true
where id = 'a1111111-1111-4111-8111-111111111111'::uuid;
