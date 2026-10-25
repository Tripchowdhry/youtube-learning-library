-- Picture storage for video clips in your notes.
-- Paste this into Supabase > SQL Editor > New query, then click Run.
-- It is safe to run more than once.

-- Pictures get long random names, so they can only be found through your notes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clips', 'clips', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Each person can only add, see the list of, or delete pictures in their own folder.
drop policy if exists "Clips: upload own" on storage.objects;
create policy "Clips: upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'clips' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Clips: read own" on storage.objects;
create policy "Clips: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'clips' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Clips: delete own" on storage.objects;
create policy "Clips: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'clips' and (storage.foldername(name))[1] = auth.uid()::text);
