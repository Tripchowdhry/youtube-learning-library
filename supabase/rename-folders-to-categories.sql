-- Renames the Videos "folders" to "categories" in the database, to match the app and the other tabs.
--   table   folders            -> video_categories
--   column  videos.folder_id   -> videos.category_id
--   share   get_shared_folder  -> get_shared_video_category
-- Nothing is copied or deleted: the same rows are just renamed, so every category, video,
-- note and share link stays as it is. Security rules (RLS) move with the table.
--
-- Paste this into Supabase > SQL Editor > New query, then click Run.
-- It all happens in one step: if anything fails, nothing changes.
-- It is safe to run more than once. To undo it, run supabase/rename-categories-back-to-folders.sql.

begin;

-- Safety check first: stop (changing nothing) if any other database function still uses the old
-- names, because it would break after the rename. The share function is replaced below.
do $$
declare
  users text;
begin
  select string_agg(p.proname, ', ') into users
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname not in ('get_shared_folder', 'get_shared_video_category')
    and (p.prosrc ilike '%folders%' or p.prosrc ilike '%folder_id%');
  if users is not null then
    raise exception 'Nothing was changed. These database functions still use the old folder names: %. Send this message to Claude.', users;
  end if;
end
$$;

do $$
begin
  -- The table.
  if to_regclass('public.folders') is not null and to_regclass('public.video_categories') is null then
    alter table public.folders rename to video_categories;
  end if;

  -- The column on videos.
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'videos' and column_name = 'folder_id') then
    alter table public.videos rename column folder_id to category_id;
  end if;

  -- Index and constraint names, so they read the same as the table.
  if to_regclass('public.folders_user_idx') is not null then
    alter index public.folders_user_idx rename to video_categories_user_idx;
  end if;
  if to_regclass('public.folders_parent_idx') is not null then
    alter index public.folders_parent_idx rename to video_categories_parent_idx;
  end if;
  if to_regclass('public.videos_folder_idx') is not null then
    alter index public.videos_folder_idx rename to videos_category_idx;
  end if;
  if exists (select 1 from pg_constraint where conname = 'videos_folder_id_fkey' and conrelid = 'public.videos'::regclass) then
    alter table public.videos rename constraint videos_folder_id_fkey to videos_category_id_fkey;
  end if;
  if exists (select 1 from pg_constraint where conname = 'folders_pkey' and conrelid = 'public.video_categories'::regclass) then
    alter table public.video_categories rename constraint folders_pkey to video_categories_pkey;
  end if;
  if exists (select 1 from pg_constraint where conname = 'folders_parent_id_fkey' and conrelid = 'public.video_categories'::regclass) then
    alter table public.video_categories rename constraint folders_parent_id_fkey to video_categories_parent_id_fkey;
  end if;
  if exists (select 1 from pg_constraint where conname = 'folders_user_id_fkey' and conrelid = 'public.video_categories'::regclass) then
    alter table public.video_categories rename constraint folders_user_id_fkey to video_categories_user_id_fkey;
  end if;
  if exists (select 1 from pg_constraint where conname = 'folders_name_check' and conrelid = 'public.video_categories'::regclass) then
    alter table public.video_categories rename constraint folders_name_check to video_categories_name_check;
  end if;
  if exists (select 1 from pg_constraint where conname = 'folders_share_token_key' and conrelid = 'public.video_categories'::regclass) then
    alter table public.video_categories rename constraint folders_share_token_key to video_categories_share_token_key;
  end if;

  -- The security rule's name (the rule itself moved with the table).
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'video_categories' and policyname = 'Own folders') then
    alter policy "Own folders" on public.video_categories rename to "Own video categories";
  end if;
end
$$;

-- The old share function read the old names, so it goes; the new one reads the new names.
-- Share links keep working: they use share_token, which hasn't changed.
drop function if exists public.get_shared_folder(uuid);

create or replace function public.get_shared_video_category(token uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  with recursive tree as (
    select c.id, c.name, c.parent_id, c.position
    from video_categories c
    where c.share_token = token
    union all
    select c.id, c.name, c.parent_id, c.position
    from video_categories c
    join tree t on c.parent_id = t.id
  )
  select case
    when not exists (select 1 from video_categories where share_token = token) then null
    else json_build_object(
      'category', (select json_build_object('id', id, 'name', name) from video_categories where share_token = token),
      'categories', (select coalesce(json_agg(tree order by tree.position, tree.name), '[]'::json) from tree),
      'videos', (
        select coalesce(json_agg(json_build_object(
          'id', v.id, 'category_id', v.category_id, 'youtube_id', v.youtube_id, 'url', v.url,
          'title', v.title, 'channel', v.channel, 'thumbnail_url', v.thumbnail_url,
          'tags', v.tags, 'position', v.position
        ) order by v.position), '[]'::json)
        from videos v
        where v.category_id in (select id from tree)
      )
    )
  end;
$$;

revoke all on function public.get_shared_video_category(uuid) from public;
grant execute on function public.get_shared_video_category(uuid) to anon, authenticated;

-- Tell the Supabase API about the new names right away.
notify pgrst, 'reload schema';

commit;
