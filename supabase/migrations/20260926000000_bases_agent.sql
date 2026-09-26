-- Agent IA Live — schéma de base.
--
-- Chaque ligne appartient à un utilisateur (user_id = auth.uid()). Pour
-- l'instant l'outil sert à une seule personne, mais tout est cloisonné par
-- utilisateur dès le départ : le jour où il devient public et payant, il n'y
-- a rien à réécrire.

-- ---------------------------------------------------------------------------
-- Réglages de l'agent (une ligne par utilisateur)
-- ---------------------------------------------------------------------------
create table public.reglages_agent (
  user_id uuid primary key references auth.users (id) on delete cascade,
  agent_actif boolean not null default false,
  -- Tant que c'est vrai, chaque publication / message passe par « à valider »
  -- avant d'être exécuté.
  validation_requise boolean not null default true,
  -- prudent : accès officiels (API) et rythmes humains ; agressif : plus de
  -- volume, au risque de blocage des comptes.
  mode text not null default 'prudent' check (mode in ('prudent', 'agressif')),
  limite_contacts_jour integer not null default 20 check (limite_contacts_jour between 0 and 1000),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Comptes connectés (réseaux sociaux, e-mail…)
-- Les jetons d'accès ne sont PAS stockés ici : ils iront dans Supabase Vault
-- quand on branchera chaque plateforme.
-- ---------------------------------------------------------------------------
create table public.comptes_connectes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plateforme text not null,
  libelle text,
  statut text not null default 'a_connecter'
    check (statut in ('a_connecter', 'connecte', 'erreur', 'desactive')),
  created_at timestamptz not null default now(),
  unique (user_id, plateforme, libelle)
);

-- ---------------------------------------------------------------------------
-- Tâches de l'agent
-- ---------------------------------------------------------------------------
create table public.taches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null
    check (type in ('publication', 'reponse', 'prospection', 'relance', 'appareil', 'autre')),
  plateforme text,
  titre text not null,
  consigne text not null default '',
  statut text not null default 'en_attente'
    check (statut in ('en_attente', 'a_valider', 'en_cours', 'terminee', 'echouee', 'annulee')),
  planifiee_pour timestamptz,
  resultat jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index taches_user_statut_idx on public.taches (user_id, statut, created_at desc);

-- Journal « en direct » : chaque étape que l'agent exécute.
create table public.evenements_taches (
  id bigint generated always as identity primary key,
  tache_id uuid references public.taches (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  niveau text not null default 'info' check (niveau in ('info', 'action', 'erreur')),
  message text not null,
  capture_url text,
  created_at timestamptz not null default now()
);
create index evenements_user_idx on public.evenements_taches (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Prospection (mini-CRM)
-- ---------------------------------------------------------------------------
create table public.prospects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null default 'entreprise' check (type in ('entreprise', 'particulier')),
  nom text not null,
  entreprise text,
  email text,
  telephone text,
  site text,
  source text,
  statut text not null default 'nouveau'
    check (statut in ('nouveau', 'contacte', 'relance', 'a_repondu', 'client', 'refus', 'ne_plus_contacter')),
  -- RGPD : un particulier ne peut être démarché qu'avec son accord préalable.
  consentement boolean not null default false,
  notes text,
  dernier_contact_at timestamptz,
  created_at timestamptz not null default now()
);
create index prospects_user_statut_idx on public.prospects (user_id, statut);

create table public.interactions_prospects (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  canal text not null,
  sens text not null check (sens in ('sortant', 'entrant')),
  contenu text not null,
  created_at timestamptz not null default now()
);

-- Garde-fou RGPD côté base : aucun message sortant vers un particulier sans
-- consentement, ni vers quelqu'un qui a demandé à ne plus être contacté.
-- Même si l'agent se trompe, la base refuse.
create function public.verifier_contact_autorise() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  p record;
begin
  if new.sens <> 'sortant' then
    return new;
  end if;
  select type, consentement, statut into p from public.prospects where id = new.prospect_id;
  if p.statut = 'ne_plus_contacter' then
    raise exception 'Ce prospect a demandé à ne plus être contacté.';
  end if;
  if p.type = 'particulier' and not p.consentement then
    raise exception 'Particulier sans consentement : démarchage interdit (RGPD).';
  end if;
  return new;
end;
$$;

create trigger interactions_contact_autorise
  before insert on public.interactions_prospects
  for each row execute function public.verifier_contact_autorise();

-- updated_at automatique
create function public.toucher_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger taches_updated_at before update on public.taches
  for each row execute function public.toucher_updated_at();
create trigger reglages_updated_at before update on public.reglages_agent
  for each row execute function public.toucher_updated_at();

-- ---------------------------------------------------------------------------
-- RLS : chacun ne voit et ne modifie que ses propres lignes.
-- ---------------------------------------------------------------------------
alter table public.reglages_agent enable row level security;
alter table public.comptes_connectes enable row level security;
alter table public.taches enable row level security;
alter table public.evenements_taches enable row level security;
alter table public.prospects enable row level security;
alter table public.interactions_prospects enable row level security;

create policy "proprietaire" on public.reglages_agent
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "proprietaire" on public.comptes_connectes
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "proprietaire" on public.taches
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "proprietaire" on public.evenements_taches
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "proprietaire" on public.prospects
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "proprietaire" on public.interactions_prospects
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Vue « en direct » : le site reçoit les nouveaux événements et l'état des
-- tâches sans recharger la page.
alter publication supabase_realtime add table public.evenements_taches, public.taches;
