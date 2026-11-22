-- Lets the AI usage page show how much room BrainShelf takes in Supabase: the database size,
-- its biggest tables, and the files you've uploaded (ScrapBook files and video clips).
-- Paste this into Supabase > SQL Editor > New query, then click Run.
-- It is safe to run more than once. Without it the page just leaves the Storage section out.
-- To remove it again: drop function public.storage_stats();

create or replace function public.storage_stats()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    -- The whole database, as Supabase counts it towards the plan's database limit.
    'database_bytes', pg_database_size(current_database()),
    -- Size of each BrainShelf table, with its indexes, and roughly how many rows it holds.
    'tables', coalesce((
      select json_agg(t order by t.bytes desc)
      from (
        select c.relname as name,
               pg_total_relation_size(c.oid) as bytes,
               greatest(c.reltuples, 0)::bigint as rows
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
      ) t
    ), '[]'::json),
    -- Only your own files, by bucket.
    'files', coalesce((
      select json_agg(f order by f.bytes desc)
      from (
        select o.bucket_id as bucket,
               count(*) as count,
               coalesce(sum((o.metadata ->> 'size')::bigint), 0) as bytes
        from storage.objects o
        where (storage.foldername(o.name))[1] = auth.uid()::text
        group by o.bucket_id
      ) f
    ), '[]'::json)
  );
$$;

revoke all on function public.storage_stats() from public, anon;
grant execute on function public.storage_stats() to authenticated;

-- Tell the API about the new function straight away.
notify pgrst, 'reload schema';
