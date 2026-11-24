-- Lets the AI usage page show bandwidth: how much data BrainShelf has sent this month from Supabase
-- (database, files, sign-in) and from Vercel (the app's pages), next to each free plan's limit.
-- Neither Supabase nor Vercel lets an app read its own bandwidth, so the app counts what it
-- downloads in each signed-in browser and adds it here, one row per person, month and source.
-- A new month starts a new row, so the numbers start again from zero on the 1st (UTC).
-- Paste this into Supabase > SQL Editor > New query, then click Run.
-- It is safe to run more than once. Without it the app works as before; nothing is counted.
-- To remove it again: drop function public.add_bandwidth; drop function public.bandwidth_stats; drop table public.bandwidth_usage;

create table if not exists public.bandwidth_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The first day of the month, in UTC.
  month date not null,
  -- 'supabase' or 'vercel'.
  source text not null check (source in ('supabase', 'vercel')),
  bytes bigint not null default 0,
  requests bigint not null default 0,
  primary key (user_id, month, source)
);

create index if not exists bandwidth_usage_month_idx on public.bandwidth_usage (month);

alter table public.bandwidth_usage enable row level security;

-- Everyone can read their own rows; adding goes through add_bandwidth below.
drop policy if exists "Own bandwidth" on public.bandwidth_usage;
create policy "Own bandwidth" on public.bandwidth_usage
  for select to authenticated
  using (user_id = auth.uid());

-- Adds what one browser counted since it last reported, to this month's row, and clears
-- months older than last month so the table stays tiny.
create or replace function public.add_bandwidth(
  supabase_bytes bigint,
  supabase_requests bigint,
  vercel_bytes bigint,
  vercel_requests bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  this_month date := date_trunc('month', now() at time zone 'utc')::date;
begin
  if auth.uid() is null then
    return;
  end if;
  insert into public.bandwidth_usage as b (user_id, month, source, bytes, requests)
  values
    (auth.uid(), this_month, 'supabase', greatest(supabase_bytes, 0), greatest(supabase_requests, 0)),
    (auth.uid(), this_month, 'vercel', greatest(vercel_bytes, 0), greatest(vercel_requests, 0))
  on conflict (user_id, month, source) do update
    set bytes = b.bytes + excluded.bytes,
        requests = b.requests + excluded.requests;
  delete from public.bandwidth_usage where month < (this_month - interval '1 month');
end;
$$;

-- This month and last month, for everyone together (the free limits are for the whole app)
-- and for you.
create or replace function public.bandwidth_stats()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  with m as (
    select date_trunc('month', now() at time zone 'utc')::date as this_month
  )
  select json_build_object(
    'month', (select this_month from m),
    'rows', coalesce((
      select json_agg(r)
      from (
        select b.month,
               b.source,
               sum(b.bytes)::bigint as bytes,
               sum(b.requests)::bigint as requests,
               coalesce(sum(b.bytes) filter (where b.user_id = auth.uid()), 0)::bigint as my_bytes,
               count(distinct b.user_id)::int as people
        from public.bandwidth_usage b, m
        where b.month >= (m.this_month - interval '1 month')
        group by b.month, b.source
      ) r
    ), '[]'::json)
  );
$$;

revoke all on function public.add_bandwidth(bigint, bigint, bigint, bigint) from public, anon;
grant execute on function public.add_bandwidth(bigint, bigint, bigint, bigint) to authenticated;
revoke all on function public.bandwidth_stats() from public, anon;
grant execute on function public.bandwidth_stats() to authenticated;

-- Tell the API about the new table and functions straight away.
notify pgrst, 'reload schema';
