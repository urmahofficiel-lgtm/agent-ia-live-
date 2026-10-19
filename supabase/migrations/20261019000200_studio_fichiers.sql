-- Studio montage : photos et vidéos de l'utilisateur utilisées comme scènes.
-- Public (le serveur de montage les relit par leur adresse), chacun écrit
-- seulement dans son dossier.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('studio', 'studio', true, 52428800, array['video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "studio : ajout dans son dossier" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'studio' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "studio : lecture de son dossier" on storage.objects
  for select to authenticated
  using (bucket_id = 'studio' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "studio : suppression dans son dossier" on storage.objects
  for delete to authenticated
  using (bucket_id = 'studio' and (storage.foldername(name))[1] = (select auth.uid())::text);
