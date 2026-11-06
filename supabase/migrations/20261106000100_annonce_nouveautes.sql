-- Annonce des nouveautés de BTP Ecosystem (accord de Younes du 06/11/2026) :
-- chaque jour, la route /api/agent/nouveautes lit le plan du site ; une page
-- de fonctionnalité jamais vue devient une publication « Nouveau : … ».
-- Première lecture : tout ce qui existe déjà est noté comme vu, sans rien publier.

alter table public.reglages_agent
  add column if not exists annonce_nouveautes boolean not null default false;

create table if not exists public.nouveautes_vues (
  user_id uuid not null references auth.users (id) on delete cascade,
  url text not null,
  vue_le timestamptz not null default now(),
  primary key (user_id, url)
);
alter table public.nouveautes_vues enable row level security;
revoke all on public.nouveautes_vues from anon, authenticated;

create or replace function public.agent_comptes_nouveautes(p_secret text)
returns table (user_id uuid, urls text[])
language plpgsql stable security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  return query
    select r.user_id, coalesce((select array_agg(n.url) from public.nouveautes_vues n where n.user_id = r.user_id), '{}')
      from public.reglages_agent r
     where r.annonce_nouveautes and r.agent_actif;
end;
$$;

-- Note les pages vues ; pour une page nouvelle (et pas à la première lecture),
-- crée les publications fournies (3 au plus). Renvoie le nombre de publications.
create or replace function public.agent_annoncer_nouveaute(p_secret text, p_user uuid, p_url text, p_publications jsonb)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_premiere boolean;
  v_validation boolean;
  v_n int := 0;
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  if p_url !~ '^https://www\.btp-ecosystem\.com/fonctionnalites/[a-z0-9-]+$' then
    raise exception 'adresse invalide';
  end if;
  select not exists (select 1 from public.nouveautes_vues n where n.user_id = p_user) into v_premiere;
  insert into public.nouveautes_vues (user_id, url) values (p_user, p_url) on conflict do nothing;
  if not found or v_premiere or jsonb_typeof(p_publications) <> 'array' then
    return 0;
  end if;

  select coalesce(r.validation_requise, true) into v_validation
    from public.reglages_agent r where r.user_id = p_user and r.annonce_nouveautes and r.agent_actif;
  if not found then
    return 0;
  end if;

  insert into public.taches (user_id, type, plateforme, marche, titre, consigne, statut, planifiee_pour, resultat)
  select p_user, 'publication', x ->> 'plateforme', 'fr-FR', left(x ->> 'titre', 200), left(coalesce(x ->> 'consigne', ''), 4000),
         case when v_validation then 'a_valider' else 'en_attente' end,
         (x ->> 'planifiee_pour')::timestamptz,
         jsonb_build_object('source', 'nouveaute', 'page', p_url)
           || case when (x ->> 'carrousel')::boolean then jsonb_build_object('format', 'carrousel', 'video_etat', 'carrousel') else '{}'::jsonb end
    from (select * from jsonb_array_elements(p_publications) limit 3) as e(x)
   where coalesce(x ->> 'titre', '') <> ''
     and (x ->> 'planifiee_pour')::timestamptz between now() and now() + interval '8 days'
     and exists (
       select 1 from public.comptes_connectes c
        where c.user_id = p_user and c.plateforme = x ->> 'plateforme' and c.statut = 'connecte'
     );
  get diagnostics v_n = row_count;

  if v_n > 0 then
    insert into public.evenements_taches (tache_id, user_id, niveau, message)
    values (null, p_user, 'action',
            format('✨ Nouveauté détectée sur le site (%s) : %s publication(s) d''annonce préparée(s)', p_url, v_n)
            || case when v_validation then ' (à valider dans Publications).' else '.' end);
  end if;
  return v_n;
end;
$$;

revoke all on function public.agent_comptes_nouveautes(text) from public, authenticated;
revoke all on function public.agent_annoncer_nouveaute(text, uuid, text, jsonb) from public, authenticated;
grant execute on function public.agent_comptes_nouveautes(text) to anon;
grant execute on function public.agent_annoncer_nouveaute(text, uuid, text, jsonb) to anon;

select cron.schedule(
  'agent-nouveautes',
  '23 7 * * *',
  $$
  select net.http_post(
    url := 'https://agent-ia-live.vercel.app/api/agent/nouveautes',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-agent-secret', (select valeur from prive.secrets where nom = 'agent_tick')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
