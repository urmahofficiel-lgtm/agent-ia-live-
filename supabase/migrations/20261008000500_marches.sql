-- Marchés (langue + pays) : chaque compte connecté publie pour un marché
-- (« fr-FR » par défaut). Une page Facebook « Italia » reçoit des posts, des
-- visuels et des vidéos en italien. Chaque publication porte son marché ; le
-- moteur publie avec le compte du même réseau et du même marché.
-- Même liste que MARCHES (src/lib/marches.ts).
-- Les fonctions du moteur qui renvoient le marché ont un nouveau nom
-- (agent_publications_dues, agent_redactions_a_faire, agent_videos_a_tourner,
-- agent_pilotes_du_jour) : les anciennes ne sont plus appelées.

create or replace function prive.marche_valide(p_marche text) returns text
language sql immutable set search_path = '' as $$
  select case when p_marche in ('fr-FR', 'en-GB', 'es-ES', 'it-IT', 'de-DE', 'pt-PT', 'nl-NL')
              then p_marche else 'fr-FR' end
$$;

alter table public.comptes_connectes
  add column marche text not null default 'fr-FR'
    check (marche in ('fr-FR', 'en-GB', 'es-ES', 'it-IT', 'de-DE', 'pt-PT', 'nl-NL'));

alter table public.taches
  add column marche text
    check (marche is null or marche in ('fr-FR', 'en-GB', 'es-ES', 'it-IT', 'de-DE', 'pt-PT', 'nl-NL'));

-- Connexion Meta : les choix faits dans Comptes (compte utilisé, marché)
-- sont gardés quand l'utilisateur se reconnecte pour ajouter une page : les
-- pages sont mises à jour sur place (plus d'effacement puis recréation). La
-- première page de chaque réseau n'est utilisée d'office qu'à la première
-- connexion ; une page qui n'est plus autorisée passe en erreur.
create or replace function public.meta_enregistrer_comptes(p_secret text, p_user uuid, p_comptes jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  c jsonb;
  v_id uuid;
  v_n integer := 0;
  v_premiere boolean;
  v_libelles text[] := '{}';
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  v_premiere := not exists (
    select 1 from public.comptes_connectes x where x.user_id = p_user and x.fournisseur = 'meta'
  );
  for c in select * from jsonb_array_elements(p_comptes) loop
    insert into public.comptes_connectes as cc (user_id, plateforme, libelle, statut, fournisseur, compte_externe_id, nom_utilisateur)
    values (
      p_user,
      c ->> 'plateforme',
      'meta:' || (c ->> 'externe_id'),
      case when v_premiere and not exists (
        select 1 from public.comptes_connectes x
         where x.user_id = p_user and x.fournisseur = 'meta' and x.plateforme = c ->> 'plateforme'
      ) then 'connecte' else 'desactive' end,
      'meta',
      c ->> 'externe_id',
      c ->> 'nom'
    )
    on conflict (user_id, plateforme, libelle) do update
      set statut = case when cc.statut = 'desactive' then 'desactive' else 'connecte' end,
          fournisseur = 'meta',
          compte_externe_id = excluded.compte_externe_id,
          nom_utilisateur = excluded.nom_utilisateur
    returning cc.id into v_id;
    insert into prive.jetons_meta (compte_id, jeton) values (v_id, c ->> 'jeton')
    on conflict (compte_id) do update set jeton = excluded.jeton;
    v_libelles := v_libelles || ('meta:' || (c ->> 'externe_id'));
    v_n := v_n + 1;
  end loop;
  update public.comptes_connectes
     set statut = 'erreur'
   where user_id = p_user and fournisseur = 'meta' and not (libelle = any (v_libelles));
  return v_n;
end;
$$;

-- Publications à l'heure (remplace agent_taches_dues) : le compte du même
-- réseau et du même marché que la publication.
create or replace function public.agent_publications_dues(p_secret text)
returns table (tache_id uuid, user_id uuid, plateforme text, titre text, consigne text, brouillon text,
               visuel_url text, video_url text, compte_externe_id text, cible_urn text, fournisseur text,
               contexte text, marche text)
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
           c.compte_externe_id,
           c.cible_urn,
           c.fournisseur,
           prive.contexte_marque(t.user_id),
           prive.marche_valide(t.marche)
    from public.taches t
    join public.reglages_agent r on r.user_id = t.user_id and r.agent_actif
    left join lateral (
      select cc.compte_externe_id, cc.cible_urn, cc.fournisseur from public.comptes_connectes cc
       where cc.user_id = t.user_id and cc.plateforme = t.plateforme and cc.statut = 'connecte'
         and cc.marche = prive.marche_valide(t.marche)
       order by (cc.fournisseur <> 'zernio') desc, cc.created_at desc limit 1
    ) c on true
    where t.statut = 'en_attente'
      and t.type = 'publication'
      and (t.planifiee_pour is null or t.planifiee_pour <= now())
      and (
        t.plateforme is distinct from 'tiktok'
        or t.resultat ->> 'video_url' is not null
        or t.resultat ->> 'video_etat' = 'echec'
        or coalesce((t.resultat ->> 'essais_video')::int, 0) >= 2
        or coalesce(t.planifiee_pour, t.created_at) <= now() - interval '45 minutes'
      )
    order by coalesce(t.planifiee_pour, t.created_at)
    limit 5;
end;
$$;
revoke all on function public.agent_publications_dues(text) from public, authenticated;
grant execute on function public.agent_publications_dues(text) to anon;

-- Brouillons à préparer (remplace agent_brouillons_a_faire), avec le marché.
create or replace function public.agent_redactions_a_faire(p_secret text)
returns table (tache_id uuid, type text, plateforme text, titre text, consigne text, contexte text, brouillon text, marche text)
language plpgsql security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  return query
    select t.id, t.type, t.plateforme, t.titre, t.consigne, prive.contexte_marque(t.user_id), t.resultat ->> 'brouillon',
           prive.marche_valide(t.marche)
    from public.taches t
    where t.statut in ('a_valider', 'en_attente')
      and t.type in ('publication', 'reponse', 'prospection', 'relance')
      and coalesce((t.resultat ->> 'essais_brouillon')::int, 0) < 3
      and (
        t.resultat is null
        or t.resultat ->> 'brouillon' is null
        or (t.type = 'publication' and t.resultat ->> 'visuel_url' is null and t.resultat ->> 'visuel_echec' is null)
      )
    order by coalesce(t.planifiee_pour, t.created_at)
    limit 2;
end;
$$;
revoke all on function public.agent_redactions_a_faire(text) from public, authenticated;
grant execute on function public.agent_redactions_a_faire(text) to anon;

-- Vidéos à créer (remplace agent_videos_a_faire), avec le marché.
create or replace function public.agent_videos_a_tourner(p_secret text)
returns table (tache_id uuid, user_id uuid, plateforme text, titre text, consigne text, brouillon text,
               contexte text, site text, essais integer, marche text)
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
      )
      and coalesce((t.resultat ->> 'essais_video')::int, 0) < 2
    order by coalesce(t.planifiee_pour, t.created_at)
    limit 1;
end;
$$;
revoke all on function public.agent_videos_a_tourner(text) from public, authenticated;
grant execute on function public.agent_videos_a_tourner(text) to anon;

-- Pilote automatique (remplace agent_pilotes_a_planifier) : un canal par
-- réseau et par marché des comptes connectés.
create or replace function public.agent_pilotes_du_jour(p_secret text)
returns table (user_id uuid, jour date, rythme jsonb, creneaux text[], canaux jsonb, contexte text,
               titres_recents text[], apprentissage text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_local timestamp := now() at time zone 'Europe/Paris';
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  if extract(hour from v_local) < 5 then
    return;
  end if;
  return query
    select r.user_id, v_local::date, r.rythme, r.creneaux,
           coalesce((
             select jsonb_agg(distinct jsonb_build_object('plateforme', c.plateforme, 'marche', c.marche))
               from public.comptes_connectes c
              where c.user_id = r.user_id and c.statut = 'connecte'
           ), '[]'::jsonb),
           prive.contexte_marque(r.user_id),
           coalesce((
             select array_agg(y.titre) from (
               select t.titre from public.taches t
                where t.user_id = r.user_id and t.type = 'publication' and t.created_at > now() - interval '30 days'
                group by t.titre
                order by max(t.created_at) desc
                limit 100
             ) y
           ), '{}'::text[]),
           nullif(to_jsonb(r) -> 'apprentissage' ->> 'resume', '')
    from public.reglages_agent r
    where r.agent_actif and r.autopilote
      and (r.derniere_planification is null or r.derniere_planification < v_local::date)
    order by r.derniere_planification nulls first, r.user_id
    limit 2;
end;
$$;
revoke all on function public.agent_pilotes_du_jour(text) from public, authenticated;
grant execute on function public.agent_pilotes_du_jour(text) to anon;

-- Planification du jour : chaque tâche garde son marché ; un compte du même
-- réseau et du même marché doit être connecté.
create or replace function public.agent_planifier_jour(p_secret text, p_user uuid, p_jour date, p_taches jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_validation boolean;
  v_n int := 0;
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  if p_jour <> (now() at time zone 'Europe/Paris')::date then
    raise exception 'jour invalide';
  end if;
  if jsonb_typeof(p_taches) <> 'array' or jsonb_array_length(p_taches) > 60 then
    raise exception 'taches invalides';
  end if;

  update public.reglages_agent
     set derniere_planification = p_jour
   where user_id = p_user and agent_actif and autopilote
     and (derniere_planification is null or derniere_planification < p_jour)
  returning validation_requise into v_validation;
  if not found then
    return 0;
  end if;

  insert into public.taches (user_id, type, plateforme, marche, titre, consigne, statut, planifiee_pour, resultat)
  select p_user, 'publication', x ->> 'plateforme', prive.marche_valide(x ->> 'marche'),
         left(x ->> 'titre', 200), left(coalesce(x ->> 'consigne', ''), 4000),
         case when v_validation then 'a_valider' else 'en_attente' end,
         (x ->> 'planifiee_pour')::timestamptz,
         jsonb_build_object('source', 'pilote')
    from jsonb_array_elements(p_taches) x
   where coalesce(x ->> 'titre', '') <> ''
     and (x ->> 'planifiee_pour')::timestamptz between now() - interval '1 hour' and now() + interval '1 day'
     and exists (
       select 1 from public.comptes_connectes c
        where c.user_id = p_user and c.plateforme = x ->> 'plateforme' and c.statut = 'connecte'
          and c.marche = prive.marche_valide(x ->> 'marche')
     )
     and not exists (
       select 1 from public.taches t
        where t.user_id = p_user and t.type = 'publication' and t.plateforme = x ->> 'plateforme'
          and prive.marche_valide(t.marche) = prive.marche_valide(x ->> 'marche')
          and t.statut not in ('annulee', 'echouee')
          and t.planifiee_pour between (x ->> 'planifiee_pour')::timestamptz - interval '1 hour'
                                   and (x ->> 'planifiee_pour')::timestamptz + interval '1 hour'
     );
  get diagnostics v_n = row_count;

  if v_n > 0 then
    insert into public.evenements_taches (tache_id, user_id, niveau, message)
    values (
      null, p_user, 'action',
      format('🗓️ Pilote automatique : %s publication%s planifiée%s pour aujourd''hui', v_n,
             case when v_n > 1 then 's' else '' end, case when v_n > 1 then 's' else '' end)
      || case when v_validation then ' (à valider dans Publications).' else '.' end
    );
  end if;
  return v_n;
end;
$$;
