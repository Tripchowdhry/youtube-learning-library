-- Adds tags (up to 3 each) to Reading, Tutorials and ScrapBook items. Videos already have them.
-- Paste this into Supabase > SQL Editor > New query, then click Run.
-- It is safe to run more than once.
alter table public.articles add column if not exists tags text[] not null default '{}';
alter table public.scraps add column if not exists tags text[] not null default '{}';
