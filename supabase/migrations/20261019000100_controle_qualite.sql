-- Contrôle qualité avant envoi : le moteur lit les publications récentes de
-- l'utilisateur (sujets déjà publiés par réseau) pour éviter les doublons.
create or replace function public.agent_publications_recentes(p_secret text, p_user uuid)
returns table (plateforme text, titre text, publiee_le timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  return query
    select t.plateforme, t.titre, coalesce((t.resultat ->> 'publie_le')::timestamptz, t.updated_at)
      from public.taches t
     where t.user_id = p_user
       and t.type = 'publication'
       and t.statut = 'terminee'
       and t.updated_at > now() - interval '4 days';
end;
$$;
revoke all on function public.agent_publications_recentes(text, uuid) from public, authenticated;
grant execute on function public.agent_publications_recentes(text, uuid) to anon;

-- Publications restées « en attente » plus de 12 h après leur heure (vidéo
-- TikTok jamais prête, texte jamais écrit) : passées en échec, avec la raison
-- dans le journal, au lieu d'attendre indéfiniment.
create or replace function public.agent_echouer_perimees(p_secret text)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  with p as (
    update public.taches
       set statut = 'echouee'
     where type = 'publication'
       and statut = 'en_attente'
       and planifiee_pour < now() - interval '12 hours'
    returning id, user_id, titre
  )
  insert into public.evenements_taches (tache_id, user_id, niveau, message)
  select id, user_id, 'erreur',
         '⏱️ « ' || titre || ' » n''a pas pu partir : toujours pas prête 12 h après son heure. Reprogrammez-la si besoin.'
    from p;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.agent_echouer_perimees(text) from public, authenticated;
grant execute on function public.agent_echouer_perimees(text) to anon;

-- Publications déjà mises de côté par le contrôle qualité puis revalidées par
-- l'utilisateur (relues) : elles partent sans nouveau contrôle.
create or replace function public.agent_controles_vus(p_secret text, p_ids uuid[])
returns setof uuid
language plpgsql security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  return query select t.id from public.taches t where t.id = any (p_ids) and t.resultat ? 'controle_raisons';
end;
$$;
revoke all on function public.agent_controles_vus(text, uuid[]) from public, authenticated;
grant execute on function public.agent_controles_vus(text, uuid[]) to anon;
