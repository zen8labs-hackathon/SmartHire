-- Admins are flagged on profiles; not configurable via env.

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- Authenticated users cannot change is_admin (service_role / SQL editor can).
create or replace function public.profiles_enforce_is_admin_immutable_for_users()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.is_admin is distinct from old.is_admin then
    if auth.role() = 'authenticated' then
      raise exception 'cannot change is_admin through the client';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_is_admin_guard on public.profiles;

create trigger profiles_is_admin_guard
  before update on public.profiles
  for each row
  execute procedure public.profiles_enforce_is_admin_immutable_for_users();
