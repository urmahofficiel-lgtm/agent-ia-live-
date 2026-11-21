-- YouTube en direct (accord de Younes du 21/11/2026) : chaîne connectée par
-- Google (API YouTube gratuite), vidéos papier découpé publiées en Shorts.
-- Comme TikTok, une publication YouTube attend sa vidéo.

alter table public.comptes_connectes drop constraint if exists comptes_connectes_fournisseur_check;
alter table public.comptes_connectes add constraint comptes_connectes_fournisseur_check
  check (fournisseur = any (array['zernio', 'meta', 'instagram', 'bluesky', 'telegram', 'linkedin', 'youtube']));

create or replace function public.compte_direct_enregistrer(p_secret text, p_user uuid, p_fournisseur text, p_plateforme text, p_externe text, p_nom text, p_jeton text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_id uuid;
  v_statut text;
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  if p_fournisseur not in ('bluesky', 'telegram', 'linkedin', 'youtube') then
    raise exception 'fournisseur non pris en charge';
  end if;
  delete from public.comptes_connectes where user_id = p_user and fournisseur = p_fournisseur and plateforme = p_plateforme;
  v_statut := case when exists (
    select 1 from public.comptes_connectes
     where user_id = p_user and plateforme = p_plateforme and statut = 'connecte'
  ) then 'desactive' else 'connecte' end;
  insert into public.comptes_connectes (user_id, plateforme, libelle, statut, fournisseur, compte_externe_id, nom_utilisateur)
  values (p_user, p_plateforme, p_fournisseur || ':' || p_externe, v_statut, p_fournisseur, p_externe, p_nom)
  returning id into v_id;
  insert into prive.jetons_meta (compte_id, jeton) values (v_id, p_jeton);
end;
$function$;

create or replace function public.agent_videos_a_tourner(p_secret text)
 returns table(tache_id uuid, user_id uuid, plateforme text, titre text, consigne text, brouillon text, contexte text, site text, essais integer, marche text)
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
      and t.plateforme in ('facebook', 'instagram', 'tiktok', 'youtube')
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
$function$;

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
           t.plateforme not in ('tiktok', 'youtube')
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

create or replace function public.agent_controle_videos(p_secret text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_relancees int := 0;
  v_coincees int := 0;
  v_abandons int := 0;
  v_histoire boolean := false;
  r record;
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;

  -- 1. Vidéos à reprendre : échouées, ou coincées plus de 2 h chez le robot.
  for r in
    select t.id, t.user_id, t.titre, t.plateforme,
           coalesce((t.resultat ->> 'relances_controle')::int, 0) as relances,
           t.resultat ->> 'video_etat' as etat
      from public.taches t
      join public.reglages_agent g on g.user_id = t.user_id and g.agent_actif
     where t.type = 'publication'
       and t.plateforme in ('tiktok', 'instagram', 'facebook', 'youtube')
       and t.statut in ('a_valider', 'en_attente')
       and t.resultat ->> 'video_url' is null
       and coalesce(t.resultat ->> 'format', '') <> 'carrousel'
       and coalesce(t.planifiee_pour, t.created_at) > now() - interval '6 hours'
       and (
         t.resultat ->> 'video_etat' = 'echec'
         or (t.resultat ->> 'video_etat' = 'a_rendre' and (t.resultat ->> 'video_debut')::timestamptz < now() - interval '2 hours')
       )
     for update of t skip locked
  loop
    if r.relances >= 3 then
      if not coalesce((select (resultat ->> 'controle_abandon')::boolean from public.taches where id = r.id), false) then
        update public.taches set resultat = resultat || '{"controle_abandon": true}'::jsonb where id = r.id;
        insert into public.evenements_taches (tache_id, user_id, niveau, message)
        values (r.id, r.user_id, 'erreur', left(format('🛡️ Contrôleur vidéos : « %s » a échoué après 3 relances, je m''arrête (à regarder).', r.titre), 500));
        v_abandons := v_abandons + 1;
      end if;
      continue;
    end if;
    update public.taches
       set resultat = (resultat - 'video_etat' - 'video_erreur' - 'video_debut')
                      || jsonb_build_object('essais_video', 0, 'relances_controle', r.relances + 1)
     where id = r.id;
    insert into public.evenements_taches (tache_id, user_id, niveau, message)
    values (r.id, r.user_id, 'action',
            left(format('🛡️ Contrôleur vidéos : vidéo %s de « %s » relancée (%s/3).',
                        case when r.etat = 'echec' then 'ratée' else 'bloquée chez le robot' end, r.titre, r.relances + 1), 500));
    v_relancees := v_relancees + 1;
  end loop;

  -- 2. Vidéos en attente du robot depuis plus de 30 min : la route le réveille.
  select count(*) into v_coincees
    from public.taches t
   where t.type = 'publication'
     and t.resultat ->> 'video_etat' = 'a_rendre'
     and (t.resultat ->> 'video_debut')::timestamptz < now() - interval '30 minutes';

  -- 3. Histoire du jour manquante après 9 h (heure de Paris).
  if (now() at time zone 'Europe/Paris')::time > time '09:00' then
    select exists (
      select 1 from public.reglages_agent g
       where g.histoires_du_jour and g.agent_actif
         and not exists (select 1 from public.histoires h
                          where h.user_id = g.user_id and h.jour = (now() at time zone 'Europe/Paris')::date)
    ) into v_histoire;
  end if;

  return jsonb_build_object('relancees', v_relancees, 'coincees', v_coincees, 'abandons', v_abandons, 'histoire_manquante', v_histoire);
end;
$$;

-- Un Short par jour pour commencer (le pilote en mettrait 3 par défaut).
update public.reglages_agent set rythme = coalesce(rythme, '{}'::jsonb) || '{"youtube": 1}'::jsonb
 where user_id = '1d464cc0-fb73-4412-895c-cb5ef69f3c3f';
