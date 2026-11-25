-- Search by meaning: each video, reading, tutorial, ScrapBook page and report gets a "meaning
-- fingerprint" (an embedding of 768 numbers from Gemini), so a search can find items about the
-- same idea even when no word matches. Uses pgvector, which Supabase includes on the free plan.
-- Paste this into Supabase > SQL Editor > New query, then click Run.
-- It is safe to run more than once. Without it the app still works, just without "Related" results.

create extension if not exists vector with schema extensions;

-- One fingerprint per item. `kind` is the tab (videos, reading, tutorial, scrapbook, reports) and
-- `source_hash` marks which version of the item's text it was made from, so the app knows when
-- an item has changed and needs a new one.
create table if not exists public.item_meanings (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null,
  item_id text not null,
  source_hash text not null,
  embedding extensions.vector(768) not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, item_id)
);

alter table public.item_meanings enable row level security;

-- Every person can only see and change their own fingerprints.
drop policy if exists "Own item meanings" on public.item_meanings;
create policy "Own item meanings" on public.item_meanings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Keeps the closest-match search quick as a library grows.
create index if not exists item_meanings_embedding_idx on public.item_meanings
  using hnsw (embedding extensions.vector_cosine_ops);

-- The items closest in meaning to a search, closest first, with a score from 0 to 1.
-- Runs as the person searching, so it only ever sees their own items.
create or replace function public.match_item_meanings(query_embedding extensions.vector(768), match_count int default 12)
returns table (kind text, item_id text, score float)
language sql stable security invoker set search_path = public, extensions as $$
  select m.kind, m.item_id, 1 - (m.embedding <=> query_embedding) as score
  from public.item_meanings m
  where m.user_id = auth.uid()
  order by m.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 50);
$$;

grant execute on function public.match_item_meanings(extensions.vector, int) to authenticated;
