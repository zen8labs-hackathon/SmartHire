-- Derive a valid profiles.username from any auth email; drop unused username_to_email RPC.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_meta text;
  v_base text;
  v_candidate text;
  v_suffix text;
  v_n int;
begin
  v_meta := nullif(trim(lower(coalesce(new.raw_user_meta_data->>'username', ''))), '');

  if v_meta is not null and v_meta ~ '^[a-z0-9_]{3,30}$' then
    v_username := v_meta;
  else
    v_base := regexp_replace(
      split_part(lower(trim(coalesce(new.email, ''))), '@', 1),
      '[^a-z0-9]+',
      '_',
      'g'
    );
    v_base := trim(both '_' from v_base);
    if v_base is null or length(v_base) < 3 then
      v_base := 'user';
    end if;
    v_base := left(v_base, 30);

    v_candidate := v_base;
    v_n := 0;
    while exists (
      select 1 from public.profiles p where lower(p.username) = lower(v_candidate)
    ) loop
      v_n := v_n + 1;
      v_suffix := '_' || v_n::text;
      v_candidate := left(v_base, greatest(1, 30 - length(v_suffix))) || v_suffix;
    end loop;
    v_username := v_candidate;
  end if;

  insert into public.profiles (id, username)
  values (new.id, v_username);

  return new;
end;
$$;

revoke execute on function public.username_to_email(text) from anon, authenticated;
drop function if exists public.username_to_email(text);
