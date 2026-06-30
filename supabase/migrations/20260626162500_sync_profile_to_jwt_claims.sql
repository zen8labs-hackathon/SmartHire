-- Create trigger function to sync public.profiles to auth.users app_metadata
create or replace function public.handle_sync_profile_to_app_metadata()
returns trigger as $$
declare
  current_chapters jsonb;
begin
  select coalesce(jsonb_agg(chapter_id), '[]'::jsonb)
  into current_chapters
  from public.profile_chapters
  where profile_id = new.id;

  update auth.users
  set raw_app_meta_data = 
    coalesce(raw_app_meta_data, '{}'::jsonb) || 
    jsonb_build_object(
      'is_admin', coalesce(new.is_admin, false),
      'work_chapter', new.work_chapter,
      'chapter_ids', current_chapters
    )
  where id = new.id;
  return new;
end;
$$ language plpgsql security definer;

-- Recreate trigger on public.profiles
drop trigger if exists on_profile_updated on public.profiles;
create trigger on_profile_updated
  after insert or update of is_admin, work_chapter on public.profiles
  for each row execute function public.handle_sync_profile_to_app_metadata();

-- Create trigger function to sync public.profile_chapters changes to auth.users app_metadata
create or replace function public.handle_sync_profile_chapters_to_app_metadata()
returns trigger as $$
declare
  target_profile_id uuid;
  current_chapters jsonb;
  profile_rec record;
begin
  if (tg_op = 'DELETE') then
    target_profile_id := old.profile_id;
  else
    target_profile_id := new.profile_id;
  end if;

  select is_admin, work_chapter
  into profile_rec
  from public.profiles
  where id = target_profile_id;

  if found then
    select coalesce(jsonb_agg(chapter_id), '[]'::jsonb)
    into current_chapters
    from public.profile_chapters
    where profile_id = target_profile_id;

    update auth.users
    set raw_app_meta_data = 
      coalesce(raw_app_meta_data, '{}'::jsonb) || 
      jsonb_build_object(
        'is_admin', coalesce(profile_rec.is_admin, false),
        'work_chapter', profile_rec.work_chapter,
        'chapter_ids', current_chapters
      )
    where id = target_profile_id;
  end if;
  
  return null;
end;
$$ language plpgsql security definer;

-- Recreate trigger on public.profile_chapters
drop trigger if exists on_profile_chapters_changed on public.profile_chapters;
create trigger on_profile_chapters_changed
  after insert or update or delete on public.profile_chapters
  for each row execute function public.handle_sync_profile_chapters_to_app_metadata();

-- One-time sync for existing profiles
do $$
declare
  rec record;
  chapter_list jsonb;
begin
  for rec in select id, is_admin, work_chapter from public.profiles loop
    select coalesce(jsonb_agg(chapter_id), '[]'::jsonb)
    into chapter_list
    from public.profile_chapters
    where profile_id = rec.id;

    update auth.users
    set raw_app_meta_data = 
      coalesce(raw_app_meta_data, '{}'::jsonb) || 
      jsonb_build_object(
        'is_admin', coalesce(rec.is_admin, false),
        'work_chapter', rec.work_chapter,
        'chapter_ids', chapter_list
      )
    where id = rec.id;
  end loop;
end;
$$;
