-- Optional: removes every tag you typed, everywhere, so you start fresh with AI tags (up to 3,
-- in purple) and up to 2 of your own. Run supabase/ai-tags.sql first.
-- Paste this into Supabase > SQL Editor > New query, then click Run.
-- Only tags are removed. Your videos, readings, pages, reports and notes are not touched.
-- This cannot be undone.
update public.videos set tags = '{}', ai_tags = null where tags <> '{}' or ai_tags is not null;
update public.articles set tags = '{}', ai_tags = null where tags <> '{}' or ai_tags is not null;
update public.scraps set tags = '{}', ai_tags = null where tags <> '{}' or ai_tags is not null;
update public.reports set tags = '{}', ai_tags = null where tags <> '{}' or ai_tags is not null;
