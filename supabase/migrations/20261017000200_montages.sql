-- Studio montage IA : plans de montage (phrase par phrase) relus et modifiés
-- par l'utilisateur avant le montage, puis la vidéo finale.

create table public.montages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source text not null default '' check (length(source) <= 2000),
  plan jsonb not null,
  statut text not null default 'brouillon' check (statut in ('brouillon', 'montage', 'pret', 'echec')),
  video_url text,
  erreur text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index montages_user_idx on public.montages (user_id, created_at desc);

alter table public.montages enable row level security;
create policy "montages : les siens" on public.montages
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function prive.montages_maj() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger montages_maj before update on public.montages
  for each row execute function prive.montages_maj();
