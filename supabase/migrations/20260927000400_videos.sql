-- Vidéos courtes générées : espace de stockage public (les réseaux doivent
-- pouvoir télécharger la vidéo), chacun n'écrit que dans son propre dossier.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', true, 52428800, array['video/mp4'])
on conflict (id) do nothing;

create policy "videos : ajout dans son dossier" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "videos : suppression dans son dossier" on storage.objects
  for delete to authenticated
  using (bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Le moteur publie la vidéo quand la tâche en a une.
drop function public.agent_taches_dues(text);
create function public.agent_taches_dues(p_secret text)
returns table (
  tache_id uuid,
  user_id uuid,
  plateforme text,
  titre text,
  consigne text,
  brouillon text,
  visuel_url text,
  video_url text,
  compte_externe_id text,
  contexte text
)
language plpgsql security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  return query
    select t.id, t.user_id, t.plateforme, t.titre, t.consigne,
           t.resultat ->> 'brouillon',
           t.resultat ->> 'visuel_url',
           t.resultat ->> 'video_url',
           (select c.compte_externe_id from public.comptes_connectes c
             where c.user_id = t.user_id and c.plateforme = t.plateforme and c.statut = 'connecte'
             order by c.created_at limit 1),
           prive.contexte_marque(t.user_id)
    from public.taches t
    join public.reglages_agent r on r.user_id = t.user_id and r.agent_actif
    where t.statut = 'en_attente'
      and t.type = 'publication'
      and (t.planifiee_pour is null or t.planifiee_pour <= now())
    order by coalesce(t.planifiee_pour, t.created_at)
    limit 5;
end;
$$;
revoke all on function public.agent_taches_dues(text) from public;
grant execute on function public.agent_taches_dues(text) to anon;
