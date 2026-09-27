-- Connexion Instagram directe (compte pro, sans page Facebook).
alter table public.comptes_connectes drop constraint comptes_connectes_fournisseur_check;
alter table public.comptes_connectes
  add constraint comptes_connectes_fournisseur_check check (fournisseur in ('zernio', 'meta', 'instagram'));

create function public.instagram_enregistrer_compte(p_secret text, p_user uuid, p_externe text, p_nom text, p_jeton text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  delete from public.comptes_connectes where user_id = p_user and fournisseur = 'instagram';
  insert into public.comptes_connectes (user_id, plateforme, libelle, statut, fournisseur, compte_externe_id, nom_utilisateur)
  values (p_user, 'instagram', 'instagram:' || p_externe, 'connecte', 'instagram', p_externe, p_nom)
  returning id into v_id;
  insert into prive.jetons_meta (compte_id, jeton) values (v_id, p_jeton);
end;
$$;
revoke all on function public.instagram_enregistrer_compte(text, uuid, text, text, text) from public;
grant execute on function public.instagram_enregistrer_compte(text, uuid, text, text, text) to anon;

-- Jeton d'un compte connecté en direct (Meta ou Instagram).
create function public.compte_jeton(p_secret text, p_user uuid, p_externe text)
returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  return (
    select j.jeton from prive.jetons_meta j
      join public.comptes_connectes c on c.id = j.compte_id
     where c.user_id = p_user and c.compte_externe_id = p_externe and c.fournisseur <> 'zernio'
     order by c.created_at desc
     limit 1
  );
end;
$$;
revoke all on function public.compte_jeton(text, uuid, text) from public;
grant execute on function public.compte_jeton(text, uuid, text) to anon;

-- Jeton prolongé (Instagram : 60 jours renouvelables).
create function public.compte_maj_jeton(p_secret text, p_user uuid, p_externe text, p_jeton text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  update prive.jetons_meta j set jeton = p_jeton
    from public.comptes_connectes c
   where c.id = j.compte_id and c.user_id = p_user and c.compte_externe_id = p_externe and c.fournisseur <> 'zernio';
end;
$$;
revoke all on function public.compte_maj_jeton(text, uuid, text, text) from public;
grant execute on function public.compte_maj_jeton(text, uuid, text, text) to anon;


-- Le moteur préfère toute connexion directe à Zernio.
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
    order by coalesce(t.planifiee_pour, t.created_at)
    limit 5;
end;
$$;
