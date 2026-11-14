-- Lets you share a report as a read-only link.
-- Paste this into Supabase > SQL Editor > New query, then click Run.
-- It is safe to run more than once.
--
-- It adds one column to the reports table, and a function that shows a shared report's title and
-- text (nothing else) to anyone who has its link. Your notes and the rest of your library stay private.
-- Stopping sharing clears the link, so the old one stops working.
-- To remove it again: drop function public.get_shared_report(uuid); alter table public.reports drop column share_token;

alter table public.reports add column if not exists share_token uuid unique;

create or replace function public.get_shared_report(token uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object('title', r.title, 'body', r.body, 'updated_at', r.updated_at)
  from reports r
  where r.share_token = token;
$$;

revoke all on function public.get_shared_report(uuid) from public;
grant execute on function public.get_shared_report(uuid) to anon, authenticated;

-- Tell the API about the changes straight away.
notify pgrst, 'reload schema';
