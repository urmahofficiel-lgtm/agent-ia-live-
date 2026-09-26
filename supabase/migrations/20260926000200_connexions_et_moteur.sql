-- Connexion réelle des réseaux (via Zernio) et moteur automatique de l'agent.

-- Chaque utilisateur a son « profil » Zernio, qui regroupe ses réseaux.
alter table public.reglages_agent add column zernio_profile_id text;

-- Identifiant du compte côté Zernio + nom affiché (@pseudo, page…).
alter table public.comptes_connectes
  add column compte_externe_id text,
  add column nom_utilisateur text;

-- ---------------------------------------------------------------------------
-- Moteur : appelé toutes les 5 minutes par pg_cron → /api/agent/tick (Vercel).
-- Le serveur Vercel n'a pas la clé service_role : il passe par ces deux
-- fonctions, qui n'agissent qu'avec le secret partagé du moteur.
-- ---------------------------------------------------------------------------
create schema if not exists prive;
revoke all on schema prive from public, anon, authenticated;

create table prive.secrets (
  nom text primary key,
  valeur text not null
);
-- La valeur du secret « agent_tick » est insérée hors migration (jamais dans git).

create function prive.secret_valide(p_secret text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from prive.secrets where nom = 'agent_tick' and valeur = p_secret)
$$;

-- Publications prêtes : agent démarré, tâche en attente, heure atteinte.
create function public.agent_taches_dues(p_secret text)
returns table (
  tache_id uuid,
  user_id uuid,
  plateforme text,
  titre text,
  consigne text,
  brouillon text,
  compte_externe_id text
)
language plpgsql security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  return query
    select t.id, t.user_id, t.plateforme, t.titre, t.consigne,
           t.resultat ->> 'brouillon',
           (select c.compte_externe_id from public.comptes_connectes c
             where c.user_id = t.user_id and c.plateforme = t.plateforme and c.statut = 'connecte'
             order by c.created_at limit 1)
    from public.taches t
    join public.reglages_agent r on r.user_id = t.user_id and r.agent_actif
    where t.statut = 'en_attente'
      and t.type = 'publication'
      and (t.planifiee_pour is null or t.planifiee_pour <= now())
    order by coalesce(t.planifiee_pour, t.created_at)
    limit 10;
end;
$$;

-- Met à jour une tâche et écrit dans le journal « en direct ».
create function public.agent_maj_tache(
  p_secret text,
  p_tache_id uuid,
  p_statut text,
  p_resultat jsonb,
  p_niveau text,
  p_message text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  update public.taches
     set statut = coalesce(p_statut, statut),
         resultat = coalesce(resultat, '{}'::jsonb) || coalesce(p_resultat, '{}'::jsonb)
   where id = p_tache_id
  returning user_id into v_user;
  if v_user is not null and p_message is not null then
    insert into public.evenements_taches (tache_id, user_id, niveau, message)
    values (p_tache_id, v_user, coalesce(p_niveau, 'info'), p_message);
  end if;
end;
$$;

revoke all on function public.agent_taches_dues(text) from public;
revoke all on function public.agent_maj_tache(text, uuid, text, jsonb, text, text) from public;
grant execute on function public.agent_taches_dues(text) to anon, authenticated;
grant execute on function public.agent_maj_tache(text, uuid, text, jsonb, text, text) to anon, authenticated;

-- Déclencheur toutes les 5 minutes.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'agent-tick',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://agent-ia-live.vercel.app/api/agent/tick',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-agent-secret', (select valeur from prive.secrets where nom = 'agent_tick')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);
