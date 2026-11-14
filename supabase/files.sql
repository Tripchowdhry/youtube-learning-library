-- Lets ScrapBook pages hold files: PDFs, slides, documents, pictures.
-- Paste this into Supabase > SQL Editor > New query, then click Run.
-- It is safe to run more than once. Run supabase/scrapbook.sql first if you haven't already.

-- The list of files on each page (name, size, type and where it's stored).
alter table public.scraps add column if not exists files jsonb not null default '[]'::jsonb;

-- Files are private: only you can open them, through short-lived links the app makes.
insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', false, 26214400)
on conflict (id) do nothing;

-- Each person can only add, open or delete files in their own folder.
drop policy if exists "Files: upload own" on storage.objects;
create policy "Files: upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Files: read own" on storage.objects;
create policy "Files: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Files: delete own" on storage.objects;
create policy "Files: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
