-- TikTok part toujours avec sa vidéo (son compris) : plus de publication en
-- image seule, même après plusieurs échecs ou un délai dépassé. Le reste ne
-- change pas.
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
         and (cc.marche = prive.marche_valide(t.marche) or prive.marche_valide(t.marche) = any (cc.langues_en_plus))
       order by (cc.marche = prive.marche_valide(t.marche)) desc, (cc.fournisseur <> 'zernio') desc, cc.created_at desc limit 1
    ) c on true
    where t.statut = 'en_attente'
      and t.type = 'publication'
      and (t.planifiee_pour is null or t.planifiee_pour <= now())
      and (
        t.plateforme is distinct from 'tiktok'
        or t.resultat ->> 'video_url' is not null
      )
    order by coalesce(t.planifiee_pour, t.created_at)
    limit 5;
end;
$$;
revoke all on function public.agent_publications_dues(text) from public, authenticated;
grant execute on function public.agent_publications_dues(text) to anon;
