-- AI tags: the AI adds up to 3 tags (shown in purple) to each new video, reading, tutorial,
-- ScrapBook page and report, and you keep up to 2 of your own.
-- Paste this into Supabase > SQL Editor > New query, then click Run.
-- It is safe to run more than once. Without it the app still works, just without AI tags.

-- The AI's tags. Empty until the AI has tagged the item (null means not tagged yet).
alter table public.videos add column if not exists ai_tags text[];
alter table public.articles add column if not exists ai_tags text[];
alter table public.scraps add column if not exists ai_tags text[];
alter table public.reports add column if not exists ai_tags text[];

-- Reports get your own tags too, like everything else.
alter table public.reports add column if not exists tags text[] not null default '{}';
