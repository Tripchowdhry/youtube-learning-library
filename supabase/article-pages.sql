-- Adds handwriting (Apple Pencil) to the notes in Reading and Tutorials.
-- Paste this into Supabase > SQL Editor > New query, then click Run.
-- It is safe to run more than once.
alter table public.articles add column if not exists pages jsonb not null default '[]'::jsonb;
