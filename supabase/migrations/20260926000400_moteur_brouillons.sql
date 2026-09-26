-- Le moteur prépare lui-même les brouillons des tâches qui n'en ont pas
-- encore : l'utilisateur n'a plus qu'à valider.
create function public.agent_brouillons_a_faire(p_secret text)
returns table (tache_id uuid, type text, plateforme text, titre text, consigne text)
language plpgsql security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  return query
    select t.id, t.type, t.plateforme, t.titre, t.consigne
    from public.taches t
    where t.statut in ('a_valider', 'en_attente')
      and t.type in ('publication', 'reponse', 'prospection', 'relance')
      and (t.resultat is null or t.resultat ->> 'brouillon' is null)
      and coalesce((t.resultat ->> 'essais_brouillon')::int, 0) < 3
    order by coalesce(t.planifiee_pour, t.created_at)
    limit 3;
end;
$$;

revoke all on function public.agent_brouillons_a_faire(text) from public;
grant execute on function public.agent_brouillons_a_faire(text) to anon;
