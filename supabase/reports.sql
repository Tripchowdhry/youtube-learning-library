-- Adds Report Writer: reports that bring together your notes from Videos, Reading and Tutorials.
-- Paste this into Supabase > SQL Editor > New query, then click Run.
-- It is safe to run more than once.
--
-- Report Writer only adds these two tables. It reads your videos, notes and articles but never
-- changes them, and nothing else in the app uses these tables, so it can't break the other sections.
-- To remove the feature's data again: drop table public.report_sources; drop table public.reports;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default 'Untitled report' check (char_length(title) between 1 and 200),
  -- The report itself: a copy of the notes (or the AI draft) that you can edit freely.
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Which videos, readings and tutorials a report draws on, in order.
-- source_id has no link to the videos or articles tables on purpose: deleting a video
-- never touches a report, and a report never stops a video from being deleted.
create table if not exists public.report_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  report_id uuid not null references public.reports (id) on delete cascade,
  source_kind text not null check (source_kind in ('video', 'article')),
  source_id uuid not null,
  position double precision not null default 0,
  unique (report_id, source_kind, source_id)
);

create index if not exists reports_user_idx on public.reports (user_id);
create index if not exists report_sources_report_idx on public.report_sources (report_id);

alter table public.reports enable row level security;
alter table public.report_sources enable row level security;

-- Every person can only see and change their own reports.
drop policy if exists "Own reports" on public.reports;
create policy "Own reports" on public.reports
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Own report sources" on public.report_sources;
create policy "Own report sources" on public.report_sources
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.reports r where r.id = report_id and r.user_id = auth.uid())
  );
