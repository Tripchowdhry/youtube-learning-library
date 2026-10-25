-- Adds the ScrapBook section: your own pages, typed or handwritten, sorted into categories.
-- Paste this into Supabase > SQL Editor > New query, then click Run.
-- It is safe to run more than once. Run supabase/articles.sql first if you haven't already.

-- ScrapBook categories live with the Reading and Tutorials ones, marked kind = 'scrap'.
alter table public.article_categories drop constraint if exists article_categories_kind_check;
alter table public.article_categories add constraint article_categories_kind_check
  check (kind in ('reading', 'tutorial', 'scrap'));

-- A page with category_id = null shows up under "Uncategorized".
-- body is the typed text (simple formatting kept as HTML); pages is the handwriting.
create table if not exists public.scraps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid references public.article_categories (id) on delete set null,
  title text not null default 'Untitled' check (char_length(title) between 1 and 200),
  body text not null default '',
  pages jsonb not null default '[]'::jsonb,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scraps_user_idx on public.scraps (user_id);
create index if not exists scraps_category_idx on public.scraps (category_id);

alter table public.scraps enable row level security;

-- Every person can only see and change their own pages.
drop policy if exists "Own scraps" on public.scraps;
create policy "Own scraps" on public.scraps
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
