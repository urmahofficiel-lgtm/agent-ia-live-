-- Groupes Facebook : un post par jour écrit pour les groupes (artisans,
-- architectes), que l'utilisateur partage lui-même depuis son téléphone
-- (aucune API ne permet de publier dans un groupe). Activé par
-- reglages_agent.rythme.facebook_groupe (nombre de posts par jour) ; aucun
-- compte connecté n'est nécessaire.

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
             select jsonb_agg(distinct jsonb_build_object('plateforme', c.plateforme, 'marche', c.marche,
                                                          'en_plus', to_jsonb(c.langues_en_plus)))
               from public.comptes_connectes c
              where c.user_id = r.user_id and c.statut = 'connecte'
           ), '[]'::jsonb)
           -- Groupes Facebook : aucun compte à connecter, l'utilisateur partage
           -- lui-même ; activé par le rythme du réseau dans les réglages.
           || case when coalesce((r.rythme ->> 'facebook_groupe')::int, 0) > 0
                   then jsonb_build_array(jsonb_build_object('plateforme', 'facebook_groupe', 'marche', 'fr-FR',
                                                             'en_plus', '[]'::jsonb))
                   else '[]'::jsonb end,
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
     and ((x ->> 'plateforme') = 'facebook_groupe' or exists (
       select 1 from public.comptes_connectes c
        where c.user_id = p_user and c.plateforme = x ->> 'plateforme' and c.statut = 'connecte'
          and (c.marche = prive.marche_valide(x ->> 'marche') or prive.marche_valide(x ->> 'marche') = any (c.langues_en_plus))
     ))
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
