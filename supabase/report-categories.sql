-- Adds categories (and categories inside categories) to Report Writer, like the other sections have.
-- Paste this into Supabase > SQL Editor > New query, then click Run.
-- It is safe to run more than once.
--
-- Your existing reports stay as they are and show up under "Uncategorized".
-- Deleting a category never deletes a report: its reports move back to Uncategorized.

-- Categories can sit inside each other, any number of levels deep (parent_id = null is the top level).
create table if not exists public.report_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  parent_id uuid references public.report_categories (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  position double precision not null default 0,
  created_at timestamptz not null default now()
);

-- A report with category_id = null shows up under "Uncategorized".
alter table public.reports add column if not exists category_id uuid references public.report_categories (id) on delete set null;

create index if not exists report_categories_user_idx on public.report_categories (user_id);
create index if not exists reports_category_idx on public.reports (category_id);

alter table public.report_categories enable row level security;

-- Every person can only see and change their own report categories.
drop policy if exists "Own report categories" on public.report_categories;
create policy "Own report categories" on public.report_categories
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
