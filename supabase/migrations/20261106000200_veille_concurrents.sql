-- Veille concurrents hebdomadaire (accord de Younes du 06/11/2026) : chaque
-- lundi, /api/agent/concurrents lit les pages d'Obat, Batappli et Tolteck et
-- leurs vidéos TikTok (Apify), puis enregistre un rapport et 3 idées.

alter table public.reglages_agent
  add column if not exists veille_concurrents boolean not null default false;

create table if not exists public.veille_concurrents (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  jour date not null,
  empreintes jsonb not null default '{}'::jsonb,
  rapport text not null,
  idees jsonb not null default '[]'::jsonb,
  videos int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists veille_concurrents_user_idx on public.veille_concurrents (user_id, created_at desc);
alter table public.veille_concurrents enable row level security;
revoke all on public.veille_concurrents from anon, authenticated;
grant select on public.veille_concurrents to authenticated;
drop policy if exists "veille concurrents : lecture de la sienne" on public.veille_concurrents;
create policy "veille concurrents : lecture de la sienne" on public.veille_concurrents
  for select to authenticated using (user_id = auth.uid());

create or replace function public.agent_comptes_veille_concurrents(p_secret text)
returns table (user_id uuid, empreintes_avant jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  return query
    select r.user_id,
           (select v.empreintes from public.veille_concurrents v where v.user_id = r.user_id order by v.created_at desc limit 1)
      from public.reglages_agent r
     where r.veille_concurrents and r.agent_actif;
end;
$$;

create or replace function public.agent_enregistrer_veille_concurrents(
  p_secret text, p_user uuid, p_jour date, p_empreintes jsonb, p_rapport text, p_idees jsonb, p_videos int
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_idees text;
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  insert into public.veille_concurrents (user_id, jour, empreintes, rapport, idees, videos)
  values (p_user, p_jour, coalesce(p_empreintes, '{}'::jsonb), left(p_rapport, 1500),
          case when jsonb_typeof(p_idees) = 'array' then p_idees else '[]'::jsonb end, coalesce(p_videos, 0));
  select string_agg('• ' || left(x, 300), E'\n') into v_idees
    from jsonb_array_elements_text(case when jsonb_typeof(p_idees) = 'array' then p_idees else '[]'::jsonb end) x;
  insert into public.evenements_taches (tache_id, user_id, niveau, message)
  values (null, p_user, 'info',
          left('🔎 Veille concurrents de la semaine (Obat, Batappli, Tolteck) :' || E'\n' || p_rapport
               || coalesce(E'\nIdées pour nous :\n' || v_idees, ''), 3000));
end;
$$;

revoke all on function public.agent_comptes_veille_concurrents(text) from public, authenticated;
revoke all on function public.agent_enregistrer_veille_concurrents(text, uuid, date, jsonb, text, jsonb, int) from public, authenticated;
grant execute on function public.agent_comptes_veille_concurrents(text) to anon;
grant execute on function public.agent_enregistrer_veille_concurrents(text, uuid, date, jsonb, text, jsonb, int) to anon;

select cron.schedule(
  'agent-concurrents',
  '47 6 * * 1',
  $$
  select net.http_post(
    url := 'https://agent-ia-live.vercel.app/api/agent/concurrents',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-agent-secret', (select valeur from prive.secrets where nom = 'agent_tick')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 280000
  );
  $$
);
