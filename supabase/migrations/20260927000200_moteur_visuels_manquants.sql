-- Le moteur complète aussi les publications qui ont un texte mais pas encore
-- de visuel (sauf si la création d'image a déjà échoué).
drop function public.agent_brouillons_a_faire(text);
create function public.agent_brouillons_a_faire(p_secret text)
returns table (tache_id uuid, type text, plateforme text, titre text, consigne text, contexte text, brouillon text)
language plpgsql security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  return query
    select t.id, t.type, t.plateforme, t.titre, t.consigne, prive.contexte_marque(t.user_id), t.resultat ->> 'brouillon'
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

revoke all on function public.agent_brouillons_a_faire(text) from public;
grant execute on function public.agent_brouillons_a_faire(text) to anon;
