-- Pilote automatique : ne pas planifier une publication sur un réseau qui en a
-- déjà une prévue à moins d'une heure (campagne programmée à la main, par
-- exemple). Évite deux posts au même moment sur le même réseau.
create or replace function public.agent_planifier_jour(p_secret text, p_user uuid, p_jour date, p_taches jsonb) returns int
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
     )
     and not exists (
       select 1 from public.taches t
        where t.user_id = p_user and t.type = 'publication' and t.plateforme = x ->> 'plateforme'
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
revoke all on function public.agent_planifier_jour(text, uuid, date, jsonb) from public, authenticated;
grant execute on function public.agent_planifier_jour(text, uuid, date, jsonb) to anon;
