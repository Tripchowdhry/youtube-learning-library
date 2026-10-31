-- Adds the green "watched" tick to each video.
-- Paste this into Supabase > SQL Editor > New query, then click Run.
-- It is safe to run more than once.
alter table public.videos add column if not exists watched_at timestamptz;
