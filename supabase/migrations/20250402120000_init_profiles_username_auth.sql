-- Profiles (1:1 with auth.users), lowercase usernames, RLS, sign-in helper RPC, and auth trigger.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,30}$')
);

create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Rows are inserted by trigger only (no insert policy for authenticated).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
begin
  v_username := lower(trim(coalesce(
    nullif(new.raw_user_meta_data->>'username', ''),
    split_part(lower(new.email), '@', 1)
  )));

  insert into public.profiles (id, username)
  values (new.id, v_username);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user();

create or replace function public.username_to_email(p_username text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select au.email::text
  from auth.users au
  inner join public.profiles p on p.id = au.id
  where lower(p.username) = lower(trim(p_username))
  limit 1;
$$;

grant execute on function public.username_to_email(text) to anon, authenticated;
