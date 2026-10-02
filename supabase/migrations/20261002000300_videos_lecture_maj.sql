-- Stockage « videos » : un envoi « upsert » (remplacer si le fichier existe)
-- exige aussi les droits de lecture et de mise à jour. Sans eux, le Studio
-- vidéo IA ne pouvait pas enregistrer ses morceaux (« new row violates
-- row-level security policy »). Limité au dossier de l'utilisateur.
create policy "videos : lecture de son dossier" on storage.objects
  for select to authenticated
  using (bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "videos : remplacement dans son dossier" on storage.objects
  for update to authenticated
  using (bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid())::text);
