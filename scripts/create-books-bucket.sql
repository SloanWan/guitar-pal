-- books: the private Storage bucket textbook PDFs are uploaded to.
-- Run once in the Supabase SQL editor. Idempotent. First use of Storage in
-- the project.
--
-- Shape:
--   * Private bucket, PDFs only, 100 MB per file.
--   * Object path is `{user_id}/{book_id}.pdf`. Every policy checks the first
--     folder of the path against auth.uid(), so a signed-in user can upload,
--     read and delete under their own id and nothing else.
--   * The browser uploads straight to Storage with the user's own session, and
--     the book-service reads the file back with the same session token the
--     Next.js proxy forwards — so no service-role or S3 key is needed on the
--     server, and "books are private" is enforced by Supabase, not by us.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('books', 'books', false, 104857600, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "read own books" on storage.objects;
create policy "read own books"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'books' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "upload own books" on storage.objects;
create policy "upload own books"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'books' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "replace own books" on storage.objects;
create policy "replace own books"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'books' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'books' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "delete own books" on storage.objects;
create policy "delete own books"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'books' and (storage.foldername(name))[1] = auth.uid()::text);
