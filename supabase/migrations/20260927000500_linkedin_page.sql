-- LinkedIn : publier au nom d'une page entreprise (organisation) plutôt que
-- du profil personnel connecté.
alter table public.comptes_connectes
  add column cible_urn text,
  add column cible_nom text;

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
  cible_urn text,
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
           prive.contexte_marque(t.user_id)
    from public.taches t
    join public.reglages_agent r on r.user_id = t.user_id and r.agent_actif
    left join lateral (
      select cc.compte_externe_id, cc.cible_urn from public.comptes_connectes cc
       where cc.user_id = t.user_id and cc.plateforme = t.plateforme and cc.statut = 'connecte'
       order by cc.created_at limit 1
    ) c on true
    where t.statut = 'en_attente'
      and t.type = 'publication'
      and (t.planifiee_pour is null or t.planifiee_pour <= now())
    order by coalesce(t.planifiee_pour, t.created_at)
    limit 5;
end;
$$;
revoke all on function public.agent_taches_dues(text) from public;
grant execute on function public.agent_taches_dues(text) to anon;
