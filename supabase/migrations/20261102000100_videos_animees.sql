-- Vidéos animées HyperFrames (accord de Younes du 02/11/2026) : le moteur
-- dépose images et sons dans « studio » et met la vidéo « a_rendre » ; le
-- robot de rendu (GitHub Actions, rendu-video/) écrit la page animée, la filme
-- et dépose le MP4. Sans rendu au bout d'une heure, montage classique.

update storage.buckets
   set allowed_mime_types = (
     select array_agg(distinct m) from unnest(allowed_mime_types || array['audio/wav', 'audio/mp4']) m
   )
 where id = 'studio';

-- File du robot de rendu.
create or replace function public.agent_rendus_a_faire(p_secret text)
returns table (tache_id uuid, user_id uuid, titre text, rendu jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  return query
    select t.id, t.user_id, t.titre, t.resultat -> 'video_rendu'
      from public.taches t
     where t.resultat ->> 'video_etat' = 'a_rendre'
       and t.resultat ->> 'video_url' is null
       and (t.resultat ->> 'video_debut')::timestamptz > now() - interval '60 minutes'
       and t.statut in ('a_valider', 'en_attente')
     order by (t.resultat ->> 'video_debut')::timestamptz
     limit 3;
end;
$$;
revoke all on function public.agent_rendus_a_faire(text) from public, authenticated;
grant execute on function public.agent_rendus_a_faire(text) to anon;

-- File du moteur : une vidéo animée restée sans rendu une heure repart en
-- montage classique (second essai).
create or replace function public.agent_videos_a_tourner(p_secret text)
returns table (tache_id uuid, user_id uuid, plateforme text, titre text, consigne text, brouillon text, contexte text, site text, essais integer, marche text)
language plpgsql security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  return query
    select t.id, t.user_id, t.plateforme, t.titre, t.consigne,
           t.resultat ->> 'brouillon',
           prive.contexte_marque(t.user_id),
           (select pm.site from public.profil_marque pm where pm.user_id = t.user_id),
           coalesce((t.resultat ->> 'essais_video')::int, 0),
           prive.marche_valide(t.marche)
    from public.taches t
    join public.reglages_agent r on r.user_id = t.user_id and r.agent_actif
    where t.type = 'publication'
      and t.plateforme in ('facebook', 'instagram', 'tiktok')
      and t.statut in ('a_valider', 'en_attente')
      and coalesce(t.resultat ->> 'brouillon', '') <> ''
      and t.resultat ->> 'video_url' is null
      and (
        t.resultat ->> 'video_etat' is null
        or (t.resultat ->> 'video_etat' = 'en_cours' and (t.resultat ->> 'video_debut')::timestamptz < now() - interval '10 minutes')
        or (t.resultat ->> 'video_etat' = 'a_rendre' and (t.resultat ->> 'video_debut')::timestamptz < now() - interval '60 minutes')
      )
      and coalesce((t.resultat ->> 'essais_video')::int, 0) < 2
    order by coalesce(t.planifiee_pour, t.created_at)
    limit 1;
end;
$$;
