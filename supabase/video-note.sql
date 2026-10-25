-- Adds a short personal note (up to 280 characters) to each video.
-- Paste this into Supabase > SQL Editor > New query, then click Run.
-- It is safe to run more than once.
alter table public.videos add column if not exists note text not null default '' check (char_length(note) <= 280);
