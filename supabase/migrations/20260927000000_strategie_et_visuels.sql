-- Stratégie (niche, marché) et visuels générés par l'IA.

-- ---------------------------------------------------------------------------
-- Profil de marque : ce que fait l'utilisateur, pour qui, où. L'analyse de
-- marché produite par l'IA est rangée dans `analyse_marche`.
-- ---------------------------------------------------------------------------
create table public.profil_marque (
  user_id uuid primary key references auth.users (id) on delete cascade,
  activite text not null default '',
  offre text not null default '',
  cible text not null default '',
  zone text not null default '',
  ton text not null default '',
  site text not null default '',
  objectif text not null default '',
  analyse_marche jsonb,
  analyse_le timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.profil_marque enable row level security;
create policy "proprietaire" on public.profil_marque
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create trigger profil_updated_at before update on public.profil_marque
  for each row execute function public.toucher_updated_at();

-- Résumé texte du profil + stratégie, injecté dans chaque demande à l'IA.
create function prive.contexte_marque(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select concat_ws(E'\n',
    nullif('Activité : ' || p.activite, 'Activité : '),
    nullif('Offre : ' || p.offre, 'Offre : '),
    nullif('Clientèle visée : ' || p.cible, 'Clientèle visée : '),
    nullif('Zone : ' || p.zone, 'Zone : '),
    nullif('Ton souhaité : ' || p.ton, 'Ton souhaité : '),
    nullif('Objectif : ' || p.objectif, 'Objectif : '),
    nullif('Niche (analyse) : ' || coalesce(p.analyse_marche ->> 'resume_niche', ''), 'Niche (analyse) : '),
    nullif('Positionnement : ' || coalesce(p.analyse_marche ->> 'positionnement', ''), 'Positionnement : '),
    nullif('Hashtags conseillés : ' || coalesce((select string_agg(h, ' ') from jsonb_array_elements_text(p.analyse_marche -> 'hashtags') h), ''), 'Hashtags conseillés : ')
  )
  from public.profil_marque p where p.user_id = p_user
$$;

-- ---------------------------------------------------------------------------
-- Visuels : images générées, servies par /api/visuels/<id> (lien non
-- devinable, comme un fichier public Supabase Storage). Le moteur n'a pas la
-- clé service_role, d'où le stockage en base plutôt que dans Storage.
-- ---------------------------------------------------------------------------
create table public.visuels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tache_id uuid references public.taches (id) on delete set null,
  mime text not null default 'image/jpeg',
  donnees text not null, -- base64
  prompt text,
  created_at timestamptz not null default now()
);
create index visuels_user_idx on public.visuels (user_id, created_at desc);
create index visuels_tache_idx on public.visuels (tache_id);
alter table public.visuels enable row level security;
create policy "proprietaire" on public.visuels
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create function public.visuel_lire(p_id uuid)
returns table (mime text, donnees text)
language sql stable security definer set search_path = '' as $$
  select v.mime, v.donnees from public.visuels v where v.id = p_id
$$;
revoke all on function public.visuel_lire(uuid) from public;
grant execute on function public.visuel_lire(uuid) to anon, authenticated;

create function public.agent_ajouter_visuel(p_secret text, p_tache_id uuid, p_mime text, p_donnees text, p_prompt text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  insert into public.visuels (user_id, tache_id, mime, donnees, prompt)
  select t.user_id, t.id, p_mime, p_donnees, p_prompt from public.taches t where t.id = p_tache_id
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.agent_ajouter_visuel(text, uuid, text, text, text) from public;
grant execute on function public.agent_ajouter_visuel(text, uuid, text, text, text) to anon;

-- Le journal « en direct » peut porter une image (capture_url existe déjà).

-- ---------------------------------------------------------------------------
-- Le moteur transmet désormais le contexte de marque et le visuel.
-- ---------------------------------------------------------------------------
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
  compte_externe_id text,
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
           (select c.compte_externe_id from public.comptes_connectes c
             where c.user_id = t.user_id and c.plateforme = t.plateforme and c.statut = 'connecte'
             order by c.created_at limit 1),
           prive.contexte_marque(t.user_id)
    from public.taches t
    join public.reglages_agent r on r.user_id = t.user_id and r.agent_actif
    where t.statut = 'en_attente'
      and t.type = 'publication'
      and (t.planifiee_pour is null or t.planifiee_pour <= now())
    order by coalesce(t.planifiee_pour, t.created_at)
    limit 5;
end;
$$;
revoke all on function public.agent_taches_dues(text) from public;
grant execute on function public.agent_taches_dues(text) to anon;

drop function public.agent_brouillons_a_faire(text);
create function public.agent_brouillons_a_faire(p_secret text)
returns table (tache_id uuid, type text, plateforme text, titre text, consigne text, contexte text)
language plpgsql security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  return query
    select t.id, t.type, t.plateforme, t.titre, t.consigne, prive.contexte_marque(t.user_id)
    from public.taches t
    where t.statut in ('a_valider', 'en_attente')
      and t.type in ('publication', 'reponse', 'prospection', 'relance')
      and (t.resultat is null or t.resultat ->> 'brouillon' is null)
      and coalesce((t.resultat ->> 'essais_brouillon')::int, 0) < 3
    order by coalesce(t.planifiee_pour, t.created_at)
    limit 2;
end;
$$;
revoke all on function public.agent_brouillons_a_faire(text) from public;
grant execute on function public.agent_brouillons_a_faire(text) to anon;

-- Le moteur peut joindre une image à un événement du journal.
create or replace function public.agent_maj_tache(
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
    insert into public.evenements_taches (tache_id, user_id, niveau, message, capture_url)
    values (p_tache_id, v_user, coalesce(p_niveau, 'info'), p_message, p_resultat ->> 'visuel_url');
  end if;
end;
$$;

-- Même contexte, pour les actions lancées depuis le site par l'utilisateur.
create function public.mon_contexte_marque() returns text
language sql stable security definer set search_path = '' as $$
  select prive.contexte_marque((select auth.uid()))
$$;
revoke all on function public.mon_contexte_marque() from public;
grant execute on function public.mon_contexte_marque() to authenticated;
