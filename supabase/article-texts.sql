-- Keeps each saved article's text after it's first read, so opening it again or asking the AI
-- about it doesn't download and pull apart the whole web page every time.
-- Paste this into Supabase > SQL Editor > New query, then click Run.
-- It is safe to run more than once. Without it the app still works; it just reads pages each time.

create table if not exists public.article_texts (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  url text not null,
  blocks jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, url)
);

alter table public.article_texts enable row level security;

-- Every person can only see and change their own saved texts.
drop policy if exists "Own article texts" on public.article_texts;
create policy "Own article texts" on public.article_texts
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- When an article is deleted, its saved text goes too (unless another saved article has the same link).
create or replace function public.forget_article_text() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if not exists (select 1 from public.articles where user_id = old.user_id and url = old.url) then
    delete from public.article_texts where user_id = old.user_id and url = old.url;
  end if;
  return old;
end;
$$;

drop trigger if exists articles_forget_text on public.articles;
create trigger articles_forget_text after delete on public.articles
  for each row execute function public.forget_article_text();
