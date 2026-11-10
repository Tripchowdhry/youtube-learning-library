-- Lets you share a Reading, Tutorials or ScrapBook category with a link, like a Videos folder.
-- Paste this into Supabase > SQL Editor > New query, then click Run.
-- It is safe to run more than once. Run supabase/articles.sql and supabase/scrapbook.sql first.

alter table public.article_categories add column if not exists share_token uuid unique;

-- Read-only view of a shared category (and the categories inside it) for anyone with the link.
-- Only titles and links are shared (and a page's typed text in the ScrapBook): summaries,
-- notes and handwriting stay private.
create or replace function public.get_shared_category(token uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  with recursive tree as (
    select c.id, c.name, c.parent_id, c.position
    from article_categories c
    where c.share_token = token
    union all
    select c.id, c.name, c.parent_id, c.position
    from article_categories c
    join tree t on c.parent_id = t.id
  )
  select case
    when not exists (select 1 from article_categories where share_token = token) then null
    else json_build_object(
      'category', (select json_build_object('id', id, 'name', name, 'kind', kind) from article_categories where share_token = token),
      'categories', (select coalesce(json_agg(tree order by tree.position, tree.name), '[]'::json) from tree),
      'articles', (
        select coalesce(json_agg(json_build_object(
          'id', a.id, 'category_id', a.category_id, 'url', a.url, 'title', a.title,
          'site', a.site, 'author', a.author, 'position', a.position
        ) order by a.position), '[]'::json)
        from articles a
        where a.category_id in (select id from tree)
      ),
      'scraps', (
        select coalesce(json_agg(json_build_object(
          'id', s.id, 'category_id', s.category_id, 'title', s.title, 'body', s.body, 'position', s.position
        ) order by s.position), '[]'::json)
        from scraps s
        where s.category_id in (select id from tree)
      )
    )
  end;
$$;

revoke all on function public.get_shared_category(uuid) from public;
grant execute on function public.get_shared_category(uuid) to anon, authenticated;
