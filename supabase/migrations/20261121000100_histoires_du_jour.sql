-- Histoires du jour (accord de Younes du 21/11/2026) : chaque matin, un agent
-- de recherche choisit une grande construction (pyramides, tours, ponts,
-- quartiers…), réunit les faits sourcés (année, architectes, entreprises,
-- ouvriers, coût, durée, anecdotes) dans une fiche, puis prépare la vidéo
-- TikTok « Histoire » en papier découpé du soir. La marque n'apparaît que sur
-- la dernière image.

alter table public.reglages_agent
  add column if not exists histoires_du_jour boolean not null default false;

create table if not exists public.histoires (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  jour date not null,
  cle text not null,
  sujet text not null,
  fiche jsonb not null default '{}'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  tache_id uuid references public.taches (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, cle)
);
create index if not exists histoires_user_idx on public.histoires (user_id, created_at desc);
alter table public.histoires enable row level security;
revoke all on public.histoires from anon, authenticated;
grant select on public.histoires to authenticated;
drop policy if exists "histoires : lecture des siennes" on public.histoires;
create policy "histoires : lecture des siennes" on public.histoires
  for select to authenticated using (user_id = auth.uid());

-- Comptes concernés, avec les sujets déjà racontés (jamais deux fois le même)
-- et un drapeau « déjà fait aujourd'hui ».
create or replace function public.agent_comptes_histoires(p_secret text, p_jour date)
returns table (user_id uuid, deja jsonb, fait_aujourdhui boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  return query
    select r.user_id,
           coalesce((select jsonb_agg(h.cle) from public.histoires h where h.user_id = r.user_id), '[]'::jsonb),
           exists (select 1 from public.histoires h where h.user_id = r.user_id and h.jour = p_jour)
      from public.reglages_agent r
     where r.histoires_du_jour and r.agent_actif
       and exists (select 1 from public.comptes_connectes c
                    where c.user_id = r.user_id and c.plateforme = 'tiktok' and c.statut = 'connecte');
end;
$$;

-- Enregistre la fiche et crée la publication TikTok du soir. Renvoie l'id de
-- la publication (null si le sujet était déjà fait).
create or replace function public.agent_enregistrer_histoire(
  p_secret text, p_user uuid, p_jour date, p_cle text, p_sujet text, p_fiche jsonb, p_sources jsonb,
  p_titre text, p_consigne text, p_planifiee_pour timestamptz
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_validation boolean;
  v_tache uuid;
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  if coalesce(p_cle, '') !~ '^[a-z0-9-]{2,80}$' then
    raise exception 'clé de sujet invalide';
  end if;
  if p_planifiee_pour not between now() and now() + interval '2 days' then
    raise exception 'date de publication invalide';
  end if;
  select coalesce(r.validation_requise, true) into v_validation
    from public.reglages_agent r where r.user_id = p_user and r.histoires_du_jour and r.agent_actif;
  if not found then
    return null;
  end if;
  if exists (select 1 from public.histoires h where h.user_id = p_user and h.cle = p_cle) then
    return null;
  end if;

  insert into public.taches (user_id, type, plateforme, marche, titre, consigne, statut, planifiee_pour, resultat)
  values (p_user, 'publication', 'tiktok', 'fr-FR', left(p_titre, 200), left(p_consigne, 6000),
          case when v_validation then 'a_valider' else 'en_attente' end, p_planifiee_pour,
          jsonb_build_object('source', 'histoire', 'histoire', p_cle))
  returning id into v_tache;

  insert into public.histoires (user_id, jour, cle, sujet, fiche, sources, tache_id)
  values (p_user, p_jour, p_cle, left(p_sujet, 200),
          case when jsonb_typeof(p_fiche) = 'object' then p_fiche else '{}'::jsonb end,
          case when jsonb_typeof(p_sources) = 'array' then p_sources else '[]'::jsonb end,
          v_tache);

  insert into public.evenements_taches (tache_id, user_id, niveau, message)
  values (v_tache, p_user, 'action',
          left(format('📚 Histoire du jour : « %s » — fiche de recherche prête (%s sources), vidéo TikTok prévue ce soir',
                      p_sujet, jsonb_array_length(case when jsonb_typeof(p_sources) = 'array' then p_sources else '[]'::jsonb end))
               || case when v_validation then ' (à valider dans Publications).' else '.' end, 1000));
  return v_tache;
end;
$$;

revoke all on function public.agent_comptes_histoires(text, date) from public, authenticated;
revoke all on function public.agent_enregistrer_histoire(text, uuid, date, text, text, jsonb, jsonb, text, text, timestamptz) from public, authenticated;
grant execute on function public.agent_comptes_histoires(text, date) to anon;
grant execute on function public.agent_enregistrer_histoire(text, uuid, date, text, text, jsonb, jsonb, text, text, timestamptz) to anon;

-- Chaque matin à 7 h 52 (heure de Paris en hiver) : recherche et préparation.
select cron.schedule(
  'agent-histoires',
  '52 6 * * *',
  $$
  select net.http_post(
    url := 'https://agent-ia-live.vercel.app/api/agent/histoires',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-agent-secret', (select valeur from prive.secrets where nom = 'agent_tick')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 280000
  );
  $$
);
