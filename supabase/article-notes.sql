-- Adds study notes (typed notes and AI answers) to Reading and Tutorials.
-- Paste this into Supabase > SQL Editor > New query, then click Run.
-- It is safe to run more than once.
alter table public.articles add column if not exists notes text not null default '';
