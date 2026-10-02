-- Stockage « animations » : images WebP (proposées par le Studio vidéo) et voix
-- WAV (personnage qui parle) ; remplacement autorisé dans son dossier (envoi
-- « upsert » lors d'une reprise).
update storage.buckets set allowed_mime_types = array['image/jpeg','image/png','image/webp','video/mp4','audio/wav'] where id = 'animations';
create policy "animations : remplacement dans son dossier" on storage.objects
  for update to authenticated
  using (bucket_id = 'animations' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'animations' and (storage.foldername(name))[1] = (select auth.uid())::text);
