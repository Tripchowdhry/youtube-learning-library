-- Adds the Reading section: saved articles and posts, sorted into categories.
-- Paste this into Supabase > SQL Editor > New query, then click Run.
-- It is safe to run more than once.

-- Categories are two levels deep: a category (parent_id = null) and its subcategories.
create table if not exists public.article_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  parent_id uuid references public.article_categories (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  position double precision not null default 0,
  created_at timestamptz not null default now()
);

-- An article with category_id = null shows up under "Uncategorized".
-- read_at is set when the article is read to the end (or ticked by hand).
create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid references public.article_categories (id) on delete set null,
  url text not null,
  title text,
  site text,
  author text,
  note text not null default '' check (char_length(note) <= 280),
  read_at timestamptz,
  position double precision not null default 0,
  created_at timestamptz not null default now()
);

-- Personal notes were added later; this adds the column to existing setups.
alter table public.articles add column if not exists note text not null default '' check (char_length(note) <= 280);

-- Your own order inside a category (drag and drop) was added later too.
alter table public.articles add column if not exists position double precision not null default 0;

create index if not exists article_categories_user_idx on public.article_categories (user_id);
create index if not exists articles_user_idx on public.articles (user_id);
create index if not exists articles_category_idx on public.articles (category_id);

alter table public.article_categories enable row level security;
alter table public.articles enable row level security;

-- Every person can only see and change their own categories and articles.
drop policy if exists "Own article categories" on public.article_categories;
create policy "Own article categories" on public.article_categories
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Own articles" on public.articles;
create policy "Own articles" on public.articles
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
