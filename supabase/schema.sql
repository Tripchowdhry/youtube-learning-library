-- BrainShelf database setup.
-- Paste this whole file into Supabase > SQL Editor > New query, then click Run.
-- It is safe to run more than once.
-- Set up before the Videos "folders" became "categories"? Run rename-folders-to-categories.sql instead
-- of re-running this file.

create extension if not exists pgcrypto;

-- Video categories form a tree: a category with parent_id = null is a top-level one.
create table if not exists public.video_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  parent_id uuid references public.video_categories (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  position double precision not null default 0,
  share_token uuid unique,
  created_at timestamptz not null default now()
);

-- A video with category_id = null shows up under "Uncategorized".
create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid references public.video_categories (id) on delete set null,
  youtube_id text not null,
  url text not null,
  title text,
  channel text,
  thumbnail_url text,
  tags text[] not null default '{}',
  position double precision not null default 0,
  created_at timestamptz not null default now()
);

-- A short personal note on each video (added later; see video-note.sql).
alter table public.videos add column if not exists note text not null default '' check (char_length(note) <= 280);

-- When the video was ticked as watched (added later; see video-watched.sql).
alter table public.videos add column if not exists watched_at timestamptz;

create index if not exists video_categories_user_idx on public.video_categories (user_id);
create index if not exists video_categories_parent_idx on public.video_categories (parent_id);
create index if not exists videos_user_idx on public.videos (user_id);
create index if not exists videos_category_idx on public.videos (category_id);

-- Row level security: every person can only see and change their own rows.
alter table public.video_categories enable row level security;
alter table public.videos enable row level security;

drop policy if exists "Own video categories" on public.video_categories;
create policy "Own video categories" on public.video_categories
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Own videos" on public.videos;
create policy "Own videos" on public.videos
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Handwritten notes, one notebook per video.
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  video_id uuid not null unique references public.videos (id) on delete cascade,
  pages jsonb not null default '[]'::jsonb,
  text text not null default '',
  updated_at timestamptz not null default now()
);

-- Typed notes were added later; this adds the column to existing setups.
alter table public.notes add column if not exists text text not null default '';

create index if not exists notes_user_idx on public.notes (user_id);

alter table public.notes enable row level security;

-- People can only read and write notes on their own videos.
drop policy if exists "Own notes" on public.notes;
create policy "Own notes" on public.notes
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.videos v where v.id = video_id and v.user_id = auth.uid())
  );

-- Read-only view of a shared category (and its subcategories) for anyone with the link.
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
