-- Pilote automatique : chaque jour, l'agent planifie seul ses publications
-- (N par réseau connecté, aux créneaux choisis, heure de Paris), sujets
-- choisis par l'IA. Et vidéos automatiques pour TikTok : une publication
-- TikTok attend sa vidéo (45 min au plus après l'heure prévue).

alter table public.reglages_agent
  add column autopilote boolean not null default false,
  -- Posts par jour et par réseau, ex. {"linkedin": 1}. Absent : 3.
  add column rythme jsonb not null default '{}'::jsonb
    check (jsonb_typeof(rythme) = 'object'),
  add column creneaux text[] not null default '{08:30,12:30,18:30}'
    check (
      cardinality(creneaux) between 1 and 6
      and array_to_string(creneaux, ',') ~ '^([01][0-9]|2[0-3]):[0-5][0-9](,([01][0-9]|2[0-3]):[0-5][0-9])*$'
    ),
  add column derniere_planification date;

-- ---------------------------------------------------------------------------
-- Vidéos automatiques : Facebook, Instagram et désormais TikTok.
-- ---------------------------------------------------------------------------
create or replace function public.agent_videos_a_faire(p_secret text)
returns table (tache_id uuid, user_id uuid, plateforme text, titre text, consigne text, brouillon text, contexte text, site text, essais int)
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
           coalesce((t.resultat ->> 'essais_video')::int, 0)
    from public.taches t
    join public.reglages_agent r on r.user_id = t.user_id and r.agent_actif
    where t.type = 'publication'
      and t.plateforme in ('facebook', 'instagram', 'tiktok')
      and t.statut in ('a_valider', 'en_attente')
      and coalesce(t.resultat ->> 'brouillon', '') <> ''
      and t.resultat ->> 'video_url' is null
      and (
        t.resultat ->> 'video_etat' is null
        -- création interrompue depuis plus de 10 min : on retente
        or (t.resultat ->> 'video_etat' = 'en_cours' and (t.resultat ->> 'video_debut')::timestamptz < now() - interval '10 minutes')
      )
      and coalesce((t.resultat ->> 'essais_video')::int, 0) < 2
    order by coalesce(t.planifiee_pour, t.created_at)
    limit 1;
end;
$$;
revoke all on function public.agent_videos_a_faire(text) from public, authenticated;
grant execute on function public.agent_videos_a_faire(text) to anon;

-- ---------------------------------------------------------------------------
-- Publications dues : une publication TikTok sans vidéo attend sa vidéo, au
-- plus 45 min après l'heure prévue (ou jusqu'à l'échec de la création), puis
-- part avec ce qu'elle a. Le reste est inchangé (connexion directe préférée).
-- ---------------------------------------------------------------------------
create or replace function public.agent_taches_dues(p_secret text)
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
  cible_urn text,
  fournisseur text,
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
           c.compte_externe_id,
           c.cible_urn,
           c.fournisseur,
           prive.contexte_marque(t.user_id)
    from public.taches t
    join public.reglages_agent r on r.user_id = t.user_id and r.agent_actif
    left join lateral (
      select cc.compte_externe_id, cc.cible_urn, cc.fournisseur from public.comptes_connectes cc
       where cc.user_id = t.user_id and cc.plateforme = t.plateforme and cc.statut = 'connecte'
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
revoke all on function public.agent_taches_dues(text) from public, authenticated;
grant execute on function public.agent_taches_dues(text) to anon;

-- ---------------------------------------------------------------------------
-- Pilote automatique (moteur).
-- ---------------------------------------------------------------------------

-- Utilisateurs à planifier aujourd'hui : agent démarré, pilote activé, pas
-- encore planifié ce jour (heure de Paris), à partir de 05:00. Fournit tout ce
-- qu'il faut à l'IA : réseaux connectés, contexte de marque, titres des 30
-- derniers jours et résumé « ce qui marche » (colonne apprentissage, lue sans
-- dépendre de son existence).
create function public.agent_pilotes_a_planifier(p_secret text)
returns table (
  user_id uuid,
  jour date,
  rythme jsonb,
  creneaux text[],
  plateformes text[],
  contexte text,
  titres_recents text[],
  apprentissage text
)
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
             select array_agg(distinct c.plateforme) from public.comptes_connectes c
              where c.user_id = r.user_id and c.statut = 'connecte'
           ), '{}'::text[]),
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
revoke all on function public.agent_pilotes_a_planifier(text) from public, authenticated;
grant execute on function public.agent_pilotes_a_planifier(text) to anon;

-- Enregistre les publications du jour, une seule fois par jour : le jour est
-- marqué planifié dans la même transaction (deux passages simultanés ne
-- doublonnent pas). Statut selon « validation requise ». Seuls les réseaux
-- réellement connectés sont retenus. p_taches : [{plateforme, titre,
-- consigne, planifiee_pour}]. Renvoie le nombre de publications créées.
create function public.agent_planifier_jour(p_secret text, p_user uuid, p_jour date, p_taches jsonb) returns int
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

  insert into public.taches (user_id, type, plateforme, titre, consigne, statut, planifiee_pour, resultat)
  select p_user, 'publication', x ->> 'plateforme', left(x ->> 'titre', 200), left(coalesce(x ->> 'consigne', ''), 4000),
         case when v_validation then 'a_valider' else 'en_attente' end,
         (x ->> 'planifiee_pour')::timestamptz,
         jsonb_build_object('source', 'pilote')
    from jsonb_array_elements(p_taches) x
   where coalesce(x ->> 'titre', '') <> ''
     and (x ->> 'planifiee_pour')::timestamptz between now() - interval '1 hour' and now() + interval '1 day'
     and exists (
       select 1 from public.comptes_connectes c
        where c.user_id = p_user and c.plateforme = x ->> 'plateforme' and c.statut = 'connecte'
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
revoke all on function public.agent_planifier_jour(text, uuid, date, jsonb) from public, authenticated;
grant execute on function public.agent_planifier_jour(text, uuid, date, jsonb) to anon;

-- ---------------------------------------------------------------------------
-- Connecteur MCP : lire ou modifier le pilote automatique. Paramètres null :
-- inchangés. p_rythme est fusionné avec le rythme existant (1 à 5 par réseau).
-- ---------------------------------------------------------------------------
create function public.mcp_pilote(
  p_secret text,
  p_empreinte text,
  p_actif boolean,
  p_rythme jsonb,
  p_creneaux text[]
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_r public.reglages_agent;
begin
  if not prive.secret_valide(p_secret) then raise exception 'secret invalide'; end if;
  v_user := prive.utilisateur_connecteur(p_empreinte);

  if p_rythme is not null and (
    jsonb_typeof(p_rythme) <> 'object'
    or exists (
      select 1 from jsonb_each(p_rythme) e
       where case when jsonb_typeof(e.value) = 'number' then (e.value)::numeric not in (1, 2, 3, 4, 5) else true end
    )
  ) then
    raise exception 'rythme invalide';
  end if;

  if p_actif is not null or p_rythme is not null or p_creneaux is not null then
    insert into public.reglages_agent (user_id) values (v_user) on conflict (user_id) do nothing;
    update public.reglages_agent
       set autopilote = coalesce(p_actif, autopilote),
           rythme = case when p_rythme is null then rythme else rythme || p_rythme end,
           creneaux = coalesce(p_creneaux, creneaux),
           updated_at = now()
     where user_id = v_user;
  end if;

  select * into v_r from public.reglages_agent where user_id = v_user;
  return jsonb_build_object(
    'actif', coalesce(v_r.autopilote, false),
    'agent_demarre', coalesce(v_r.agent_actif, false),
    'validation_requise', coalesce(v_r.validation_requise, true),
    'rythme', coalesce(v_r.rythme, '{}'::jsonb),
    'creneaux', coalesce(v_r.creneaux, '{08:30,12:30,18:30}'::text[]),
    'derniere_planification', v_r.derniere_planification,
    'reseaux_connectes', coalesce((
      select jsonb_agg(distinct c.plateforme) from public.comptes_connectes c
       where c.user_id = v_user and c.statut = 'connecte'
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.mcp_pilote(text, text, boolean, jsonb, text[]) from public, authenticated;
grant execute on function public.mcp_pilote(text, text, boolean, jsonb, text[]) to anon;
