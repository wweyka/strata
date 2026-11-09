-- Strata · private storage buckets. Every object path starts with the owner's user id.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('materials', 'materials', false, 104857600, array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.oasis.opendocument.text',
    'application/rtf',
    'application/epub+zip',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/markdown',
    'text/html',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/heic'
  ]),
  ('generated', 'generated', false, 524288000, null),
  ('avatars', 'avatars', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Uploaded materials: the owner reads, uploads, replaces and deletes inside their folder.
create policy "materials: owner can read" on storage.objects
  for select to authenticated
  using (bucket_id = 'materials' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "materials: owner can upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'materials' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "materials: owner can replace" on storage.objects
  for update to authenticated
  using (bucket_id = 'materials' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'materials' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "materials: owner can delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'materials' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Generated media (videos, page images): written by workers, readable by the owner only.
create policy "generated: owner can read" on storage.objects
  for select to authenticated
  using (bucket_id = 'generated' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Avatars
create policy "avatars: owner can read" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: owner can upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: owner can replace" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: owner can delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
