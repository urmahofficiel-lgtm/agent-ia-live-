-- Commercial automatique (accord de Younes du 18/11/2026) : les réponses
-- automatiques aux commentaires couvrent aussi Instagram et Facebook reliés en
-- direct (sans Zernio). Le moteur lit ici les comptes directs d'un utilisateur
-- qui a activé les réponses automatiques ; les jetons restent lus un par un
-- par `compte_jeton`.
create or replace function public.agent_comptes_directs_auto(p_secret text, p_user uuid)
returns table (plateforme text, fournisseur text, externe text, pseudo text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  return query
    select c.plateforme, c.fournisseur, c.compte_externe_id, c.nom_utilisateur
      from public.comptes_connectes c
      join public.reglages_agent r on r.user_id = c.user_id and r.reponses_auto
     where c.user_id = p_user
       and c.statut = 'connecte'
       and c.fournisseur in ('meta', 'instagram')
       and c.plateforme in ('facebook', 'instagram');
end;
$$;
revoke all on function public.agent_comptes_directs_auto(text, uuid) from public, authenticated;
grant execute on function public.agent_comptes_directs_auto(text, uuid) to anon;

-- Les comptes reliés seulement en direct (sans profil Zernio) sont servis aussi.
create or replace function public.agent_reponses_auto(p_secret text)
returns table (user_id uuid, profil text, contexte text, deja text[])
language plpgsql stable security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  return query
    select r.user_id, r.zernio_profile_id, prive.contexte_marque(r.user_id),
           coalesce((select array_agg(c.commentaire_id) from public.commentaires_traites c
                      where c.user_id = r.user_id and c.created_at > now() - interval '60 days'), '{}')
      from public.reglages_agent r
     where r.reponses_auto;
end;
$$;
