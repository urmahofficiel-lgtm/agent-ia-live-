-- Toutes les vidéos en papier découpé (choix de Younes du 21/11/2026) : la
-- vidéo est filmée par le robot de rendu (10 à 30 min). Instagram et Facebook
-- attendent donc leur vidéo, comme TikTok, au plus 60 min après l'heure
-- prévue ; ensuite (ou si la vidéo a échoué deux fois), la publication part
-- avec son image.

create or replace function public.agent_publications_a_envoyer(p_secret text)
 returns table(tache_id uuid, user_id uuid, plateforme text, titre text, consigne text, brouillon text, visuel_url text, video_url text, compte_externe_id text, cible_urn text, fournisseur text, contexte text, marche text, resultat jsonb)
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  return query
    with dues as (
      select t.id
        from public.taches t
        join public.reglages_agent r on r.user_id = t.user_id and r.agent_actif
       where t.statut = 'en_attente'
         and t.type = 'publication'
         and (t.planifiee_pour is null or t.planifiee_pour <= now())
         and (
           coalesce(t.resultat ->> 'format', '') <> 'carrousel'
           or t.resultat ? 'carrousel'
           or t.resultat ->> 'carrousel_etat' = 'echec'
         )
         and (
           t.plateforme is distinct from 'tiktok'
           or t.resultat ->> 'video_url' is not null
           or t.resultat ? 'carrousel'
         )
         and (
           t.plateforme not in ('instagram', 'facebook')
           or t.resultat ->> 'video_url' is not null
           or t.resultat ? 'carrousel'
           or t.resultat ->> 'video_etat' = 'echec'
           or coalesce((t.resultat ->> 'essais_video')::int, 0) >= 2
           or coalesce(t.planifiee_pour, t.created_at) <= now() - interval '60 minutes'
         )
       order by coalesce(t.planifiee_pour, t.created_at)
       limit 5
       for update of t skip locked
    ),
    pris as (
      update public.taches t
         set statut = 'en_cours'
        from dues
       where t.id = dues.id
      returning t.id, t.user_id, t.plateforme, t.titre, t.consigne, t.resultat, t.marche, t.planifiee_pour, t.created_at
    )
    select p.id, p.user_id, p.plateforme, p.titre, p.consigne,
           p.resultat ->> 'brouillon',
           p.resultat ->> 'visuel_url',
           p.resultat ->> 'video_url',
           c.compte_externe_id,
           c.cible_urn,
           c.fournisseur,
           prive.contexte_marque(p.user_id),
           prive.marche_valide(p.marche),
           p.resultat
      from pris p
      left join lateral (
        select cc.compte_externe_id, cc.cible_urn, cc.fournisseur from public.comptes_connectes cc
         where cc.user_id = p.user_id and cc.plateforme = p.plateforme and cc.statut = 'connecte'
           and (cc.marche = prive.marche_valide(p.marche) or prive.marche_valide(p.marche) = any (cc.langues_en_plus))
         order by (cc.marche = prive.marche_valide(p.marche)) desc, (cc.fournisseur <> 'zernio') desc, cc.created_at desc limit 1
      ) c on true
     order by coalesce(p.planifiee_pour, p.created_at);
end;
$function$;
