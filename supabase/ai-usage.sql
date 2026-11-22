-- Lets the AI usage page show how BrainShelf's AI is doing: one row for each AI model asked,
-- with how long it took, how many tokens Google says it used, and whether it worked.
-- Paste this into Supabase > SQL Editor > New query, then click Run.
-- It is safe to run more than once. Without it the AI works as before; the page just stays empty.
-- To remove it again: drop table public.ai_usage;

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- What asked: video, article, file, category, report, improve or handwriting.
  feature text not null,
  model text not null,
  -- 200 worked; 429 free limit used up; 503 busy; 504 took over 5 minutes; others failed.
  status integer not null,
  ok boolean not null,
  ms integer not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  -- True when this model couldn't answer and the next one was asked.
  handed_off boolean not null default false
);

create index if not exists ai_usage_user_time_idx on public.ai_usage (user_id, created_at desc);

alter table public.ai_usage enable row level security;

-- Every person can only see and add their own rows.
drop policy if exists "Own AI usage" on public.ai_usage;
create policy "Own AI usage" on public.ai_usage
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Tell the API about the new table straight away.
notify pgrst, 'reload schema';
