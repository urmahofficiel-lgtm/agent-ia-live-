-- Connexion directe à Facebook / Instagram (API Meta), sans Zernio.
-- Les jetons de page restent dans le schéma privé : ni le navigateur ni les
-- règles RLS n'y donnent accès, seul le serveur (secret du moteur) les lit.
alter table public.comptes_connectes
  add column fournisseur text not null default 'zernio' check (fournisseur in ('zernio', 'meta'));

create table prive.jetons_meta (
  compte_id uuid primary key references public.comptes_connectes (id) on delete cascade,
  jeton text not null
);
revoke all on prive.jetons_meta from public, anon, authenticated;

-- Enregistre les pages autorisées au retour de Facebook. La première page
-- (et son Instagram) est utilisée ; les autres restent disponibles.
create function public.meta_enregistrer_comptes(p_secret text, p_user uuid, p_comptes jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  c jsonb;
  v_id uuid;
  v_n integer := 0;
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  delete from public.comptes_connectes where user_id = p_user and fournisseur = 'meta';
  for c in select * from jsonb_array_elements(p_comptes) loop
    insert into public.comptes_connectes (user_id, plateforme, libelle, statut, fournisseur, compte_externe_id, nom_utilisateur)
    values (
      p_user,
      c ->> 'plateforme',
      'meta:' || (c ->> 'externe_id'),
      case when exists (
        select 1 from public.comptes_connectes x
         where x.user_id = p_user and x.fournisseur = 'meta' and x.plateforme = c ->> 'plateforme'
      ) then 'desactive' else 'connecte' end,
      'meta',
      c ->> 'externe_id',
      c ->> 'nom'
    )
    returning id into v_id;
    insert into prive.jetons_meta (compte_id, jeton) values (v_id, c ->> 'jeton');
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.meta_enregistrer_comptes(text, uuid, jsonb) from public;
grant execute on function public.meta_enregistrer_comptes(text, uuid, jsonb) to anon;

create function public.meta_jeton(p_secret text, p_user uuid, p_externe text)
returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  return (
    select j.jeton from prive.jetons_meta j
      join public.comptes_connectes c on c.id = j.compte_id
     where c.user_id = p_user and c.compte_externe_id = p_externe and c.fournisseur = 'meta'
     limit 1
  );
end;
$$;
revoke all on function public.meta_jeton(text, uuid, text) from public;
grant execute on function public.meta_jeton(text, uuid, text) to anon;

-- Le moteur connaît le fournisseur et préfère la connexion directe.
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
       order by (cc.fournisseur = 'meta') desc, cc.created_at limit 1
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
