-- Animation d'une photo à partir d'une vidéo (motion transfer, via fal.ai).
create table public.animations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  mode text not null check (mode in ('visage', 'corps')),
  statut text not null default 'en_attente'
    check (statut in ('en_attente', 'en_file', 'en_cours', 'terminee', 'echouee')),
  photo_chemin text not null,
  video_chemin text not null,
  duree_source numeric,
  fal_modele text,
  fal_requete text,
  position_file integer,
  resultat_source text, -- lien fal.ai (temporaire)
  resultat_url text,    -- copie durable dans notre stockage
  erreur text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index animations_user_idx on public.animations (user_id, created_at desc);
alter table public.animations enable row level security;
create policy "proprietaire" on public.animations
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create trigger animations_updated_at before update on public.animations
  for each row execute function public.toucher_updated_at();
alter publication supabase_realtime add table public.animations;

-- Fichiers importés (photo + vidéo source) : privés, chacun dans son dossier.
-- fal.ai les lit par un lien signé à durée limitée.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('animations', 'animations', false, 52428800, array['image/jpeg', 'image/png', 'video/mp4'])
on conflict (id) do nothing;

create policy "animations : lecture de son dossier" on storage.objects
  for select to authenticated
  using (bucket_id = 'animations' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "animations : ajout dans son dossier" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'animations' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "animations : suppression dans son dossier" on storage.objects
  for delete to authenticated
  using (bucket_id = 'animations' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Le webhook fal.ai (sans session utilisateur) met à jour l'état, protégé
-- par le secret du moteur.
create function public.animation_maj(p_secret text, p_id uuid, p_statut text, p_source text, p_erreur text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  update public.animations
     set statut = p_statut,
         resultat_source = coalesce(p_source, resultat_source),
         erreur = p_erreur
   where id = p_id and statut not in ('terminee', 'echouee');
end;
$$;
revoke all on function public.animation_maj(text, uuid, text, text, text) from public, authenticated;
grant execute on function public.animation_maj(text, uuid, text, text, text) to anon;
