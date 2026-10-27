-- Photothèque : images préparées à l'avance (Canva…) que l'agent réutilise
-- pour ses publications, avant d'essayer de créer une image par IA. Chaque
-- photo a une description : l'agent choisit celle qui va avec le post et
-- évite de reprendre une photo utilisée récemment.

create table if not exists public.phototheque (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  url text not null check (url ~ '^https://'),
  description text not null check (char_length(description) between 3 and 400),
  source text not null default 'canva',
  derniere_utilisation timestamptz,
  utilisations int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists phototheque_user on public.phototheque (user_id, derniere_utilisation);

alter table public.phototheque enable row level security;
create policy "phototheque : lecture par le propriétaire" on public.phototheque
  for select to authenticated using (user_id = auth.uid());
create policy "phototheque : ajout par le propriétaire" on public.phototheque
  for insert to authenticated with check (user_id = auth.uid());
create policy "phototheque : suppression par le propriétaire" on public.phototheque
  for delete to authenticated using (user_id = auth.uid());

-- Moteur : les photos du propriétaire d'une tâche, les moins utilisées d'abord.
create or replace function public.agent_phototheque(p_secret text, p_tache_id uuid)
returns table (id uuid, url text, description text, derniere_utilisation timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  return query
    select p.id, p.url, p.description, p.derniere_utilisation
      from public.phototheque p
      join public.taches t on t.user_id = p.user_id
     where t.id = p_tache_id
     order by p.derniere_utilisation nulls first, p.created_at
     limit 60;
end;
$$;

create or replace function public.agent_phototheque_utilisee(p_secret text, p_photo_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  update public.phototheque
     set derniere_utilisation = now(), utilisations = utilisations + 1
   where id = p_photo_id;
end;
$$;

revoke all on function public.agent_phototheque(text, uuid) from public, authenticated;
revoke all on function public.agent_phototheque_utilisee(text, uuid) from public, authenticated;
grant execute on function public.agent_phototheque(text, uuid) to anon;
grant execute on function public.agent_phototheque_utilisee(text, uuid) to anon;
