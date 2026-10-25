-- Voix réalistes : doublages de vidéos, faits par le moteur en plusieurs
-- passages (écoute → voix de chaque réplique → mixage), à partir d'une vidéo
-- déposée dans le Studio.

create table public.doublages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source_url text not null check (length(source_url) <= 2000),
  statut text not null default 'en_attente' check (statut in ('en_attente', 'en_cours', 'pret', 'echec')),
  etape text not null default 'ecoute' check (etape in ('ecoute', 'voix', 'mixage')),
  -- Étude de la vidéo : durée, répliques (temps, texte, qui parle), personnages et voix.
  etude jsonb,
  -- Voix déjà faites : {"<n° de réplique>": {"url": …, "duree": …}}.
  segments jsonb not null default '{}',
  video_url text,
  erreur text,
  echecs int not null default 0,
  pris_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index doublages_file_idx on public.doublages (statut, created_at);

alter table public.doublages enable row level security;
create policy "doublages : lecture des siens" on public.doublages
  for select to authenticated using (user_id = (select auth.uid()));
create policy "doublages : demande" on public.doublages
  for insert to authenticated
  with check (user_id = (select auth.uid()) and statut = 'en_attente' and etape = 'ecoute' and video_url is null and etude is null);
create policy "doublages : suppression des siens" on public.doublages
  for delete to authenticated using (user_id = (select auth.uid()));

-- Les voix de chaque réplique (MP3) sont déposées dans le Studio.
update storage.buckets
   set allowed_mime_types = array(select distinct unnest(allowed_mime_types || array['audio/mpeg']))
 where id = 'studio';

-- Moteur : prend le doublage suivant (un passage à la fois par doublage ; un
-- passage coupé en route est repris après 6 minutes).
create or replace function public.agent_doublage_a_faire(p_secret text)
returns table (id uuid, user_id uuid, source_url text, etape text, etude jsonb, segments jsonb, echecs int, contexte text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_id uuid;
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  -- Bloqué depuis plus d'une heure : abandonné.
  update public.doublages d
     set statut = 'echec', erreur = coalesce(d.erreur, 'Doublage trop long : abandonné.'), pris_le = null, updated_at = now()
   where d.statut in ('en_attente', 'en_cours') and d.created_at < now() - interval '1 hour';
  select d.id into v_id from public.doublages d
   where d.statut in ('en_attente', 'en_cours')
     and (d.pris_le is null or d.pris_le < now() - interval '6 minutes')
   order by d.created_at
   limit 1
   for update skip locked;
  if v_id is null then
    return;
  end if;
  update public.doublages d set statut = 'en_cours', pris_le = now(), updated_at = now() where d.id = v_id;
  return query
    select d.id, d.user_id, d.source_url, d.etape, d.etude, d.segments, d.echecs, prive.contexte_marque(d.user_id)
      from public.doublages d where d.id = v_id;
end;
$$;
revoke all on function public.agent_doublage_a_faire(text) from public, authenticated;
grant execute on function public.agent_doublage_a_faire(text) to anon;

-- Moteur : enregistre l'avancement. Champs reconnus : etape, etude,
-- segments (ajoutés aux précédents), video_url, statut, erreur, echec (+1),
-- progres (remet les échecs à zéro), libre (le passage est fini : le suivant peut reprendre tout de suite).
create or replace function public.agent_doublage_maj(p_secret text, p_id uuid, p_champs jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  update public.doublages d set
    etape = coalesce(p_champs ->> 'etape', d.etape),
    etude = coalesce(p_champs -> 'etude', d.etude),
    segments = d.segments || coalesce(p_champs -> 'segments', '{}'::jsonb),
    video_url = coalesce(p_champs ->> 'video_url', d.video_url),
    statut = coalesce(p_champs ->> 'statut', d.statut),
    erreur = case when p_champs ? 'erreur' then p_champs ->> 'erreur' else d.erreur end,
    echecs = case when (p_champs ->> 'echec')::boolean then d.echecs + 1 when (p_champs ->> 'progres')::boolean then 0 else d.echecs end,
    pris_le = case when (p_champs ->> 'libre')::boolean then null else d.pris_le end,
    updated_at = now()
  where d.id = p_id;
end;
$$;
revoke all on function public.agent_doublage_maj(text, uuid, jsonb) from public, authenticated;
grant execute on function public.agent_doublage_maj(text, uuid, jsonb) to anon;

-- Passage du moteur de doublage : chaque minute (il ne fait rien s'il n'y a
-- pas de doublage en attente).
select cron.schedule(
  'agent-doublage',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://agent-ia-live.vercel.app/api/agent/doublage',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-agent-secret', (select valeur from prive.secrets where nom = 'agent_tick')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 290000
  );
  $$
);
