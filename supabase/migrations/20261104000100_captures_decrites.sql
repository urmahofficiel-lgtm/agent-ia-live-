-- Descriptions des captures de l'application (accord de Younes du 04/11/2026) :
-- l'IA regarde chaque capture une fois et décrit l'écran ; les vidéos
-- « Explication » choisissent ensuite la capture qui illustre chaque phrase.

create table if not exists public.captures_decrites (
  user_id uuid not null references auth.users (id) on delete cascade,
  nom text not null,
  description text not null check (char_length(description) between 3 and 300),
  created_at timestamptz not null default now(),
  primary key (user_id, nom)
);
alter table public.captures_decrites enable row level security;
create policy "captures_decrites : lecture par le propriétaire" on public.captures_decrites
  for select to authenticated using (user_id = auth.uid());

-- Captures de l'utilisateur avec leur description (null si pas encore décrite).
create or replace function public.agent_captures_decrites(p_secret text, p_user uuid)
returns table (nom text, description text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  return query
    select c.n, d.description
      from prive.captures_appli(p_user) c(n)
      left join public.captures_decrites d on d.user_id = p_user and d.nom = c.n;
end;
$$;

create or replace function public.agent_decrire_capture(p_secret text, p_user uuid, p_nom text, p_description text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  insert into public.captures_decrites (user_id, nom, description)
  values (p_user, p_nom, left(p_description, 300))
  on conflict (user_id, nom) do update set description = excluded.description;
end;
$$;

revoke all on function public.agent_captures_decrites(text, uuid) from public, authenticated;
revoke all on function public.agent_decrire_capture(text, uuid, text, text) from public, authenticated;
grant execute on function public.agent_captures_decrites(text, uuid) to anon;
grant execute on function public.agent_decrire_capture(text, uuid, text, text) to anon;
