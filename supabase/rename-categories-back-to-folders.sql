-- Undoes supabase/rename-folders-to-categories.sql: puts back the old "folders" names.
-- Only use this if the app went back to the old version too.
-- Paste this into Supabase > SQL Editor > New query, then click Run.
-- It all happens in one step: if anything fails, nothing changes. It is safe to run more than once.

begin;

do $$
begin
  if to_regclass('public.video_categories') is not null and to_regclass('public.folders') is null then
    alter table public.video_categories rename to folders;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'videos' and column_name = 'category_id') then
    alter table public.videos rename column category_id to folder_id;
  end if;

  if to_regclass('public.video_categories_user_idx') is not null then
    alter index public.video_categories_user_idx rename to folders_user_idx;
  end if;
  if to_regclass('public.video_categories_parent_idx') is not null then
    alter index public.video_categories_parent_idx rename to folders_parent_idx;
  end if;
  if to_regclass('public.videos_category_idx') is not null then
    alter index public.videos_category_idx rename to videos_folder_idx;
  end if;
  if exists (select 1 from pg_constraint where conname = 'videos_category_id_fkey' and conrelid = 'public.videos'::regclass) then
    alter table public.videos rename constraint videos_category_id_fkey to videos_folder_id_fkey;
  end if;
  if exists (select 1 from pg_constraint where conname = 'video_categories_pkey' and conrelid = 'public.folders'::regclass) then
    alter table public.folders rename constraint video_categories_pkey to folders_pkey;
  end if;
  if exists (select 1 from pg_constraint where conname = 'video_categories_parent_id_fkey' and conrelid = 'public.folders'::regclass) then
    alter table public.folders rename constraint video_categories_parent_id_fkey to folders_parent_id_fkey;
  end if;
  if exists (select 1 from pg_constraint where conname = 'video_categories_user_id_fkey' and conrelid = 'public.folders'::regclass) then
    alter table public.folders rename constraint video_categories_user_id_fkey to folders_user_id_fkey;
  end if;
  if exists (select 1 from pg_constraint where conname = 'video_categories_name_check' and conrelid = 'public.folders'::regclass) then
    alter table public.folders rename constraint video_categories_name_check to folders_name_check;
  end if;
  if exists (select 1 from pg_constraint where conname = 'video_categories_share_token_key' and conrelid = 'public.folders'::regclass) then
    alter table public.folders rename constraint video_categories_share_token_key to folders_share_token_key;
  end if;

  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'folders' and policyname = 'Own video categories') then
    alter policy "Own video categories" on public.folders rename to "Own folders";
  end if;
end
$$;

drop function if exists public.get_shared_video_category(uuid);

create or replace function public.get_shared_folder(token uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  with recursive tree as (
    select f.id, f.name, f.parent_id, f.position
    from folders f
    where f.share_token = token
    union all
    select c.id, c.name, c.parent_id, c.position
    from folders c
    join tree t on c.parent_id = t.id
  )
  select case
    when not exists (select 1 from folders where share_token = token) then null
    else json_build_object(
      'folder', (select json_build_object('id', id, 'name', name) from folders where share_token = token),
      'folders', (select coalesce(json_agg(tree order by tree.position, tree.name), '[]'::json) from tree),
      'videos', (
        select coalesce(json_agg(json_build_object(
          'id', v.id, 'folder_id', v.folder_id, 'youtube_id', v.youtube_id, 'url', v.url,
          'title', v.title, 'channel', v.channel, 'thumbnail_url', v.thumbnail_url,
          'tags', v.tags, 'position', v.position
        ) order by v.position), '[]'::json)
        from videos v
        where v.folder_id in (select id from tree)
      )
    )
  end;
$$;

revoke all on function public.get_shared_folder(uuid) from public;
grant execute on function public.get_shared_folder(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
