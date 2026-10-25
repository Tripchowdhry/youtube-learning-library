-- Adds handwritten notes for videos.
-- Paste this into Supabase > SQL Editor > New query, then click Run.
-- It is safe to run more than once.

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  video_id uuid not null unique references public.videos (id) on delete cascade,
  pages jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists notes_user_idx on public.notes (user_id);

alter table public.notes enable row level security;

-- People can only read and write notes on their own videos.
drop policy if exists "Own notes" on public.notes;
create policy "Own notes" on public.notes
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.videos v where v.id = video_id and v.user_id = auth.uid())
  );
