-- Liens suivis : chaque lien d'une publication (site de la marque…) est
-- remplacé par un lien court /l/<code> qui compte les clics avant de
-- rediriger. On sait enfin quelles publications amènent des visiteurs.

create table public.liens_suivis (
  code text primary key check (code ~ '^[a-z0-9]{7}$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  tache_id uuid references public.taches (id) on delete set null,
  url text not null check (url ~ '^https?://' and length(url) <= 2000),
  clics integer not null default 0,
  dernier_clic timestamptz,
  created_at timestamptz not null default now()
);
create index liens_suivis_user_idx on public.liens_suivis (user_id);
create index liens_suivis_tache_idx on public.liens_suivis (tache_id);

alter table public.liens_suivis enable row level security;
create policy "liens suivis : lecture des siens" on public.liens_suivis
  for select to authenticated using (user_id = (select auth.uid()));

-- Création par le moteur (secret partagé) : un même lien d'une même
-- publication garde son code.
create or replace function public.lien_suivi_creer(p_secret text, p_user uuid, p_tache uuid, p_url text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  if p_url !~ '^https?://' or length(p_url) > 2000 then
    raise exception 'lien invalide';
  end if;
  select l.code into v_code from public.liens_suivis l
   where l.user_id = p_user and l.tache_id is not distinct from p_tache and l.url = p_url
   limit 1;
  if v_code is not null then
    return v_code;
  end if;
  loop
    v_code := substr(md5(random()::text || clock_timestamp()::text), 1, 7);
    begin
      insert into public.liens_suivis (code, user_id, tache_id, url) values (v_code, p_user, p_tache, p_url);
      return v_code;
    exception when unique_violation then
      -- code déjà pris : on en tire un autre
    end;
  end loop;
end;
$$;
revoke all on function public.lien_suivi_creer(text, uuid, uuid, text) from public, authenticated;
grant execute on function public.lien_suivi_creer(text, uuid, uuid, text) to anon;

-- Ouverture d'un lien court (public) : renvoie l'adresse de destination et
-- compte le clic, sauf pour les robots d'aperçu des réseaux.
create or replace function public.lien_suivi_ouvrir(p_code text, p_compter boolean)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
begin
  if p_code !~ '^[a-z0-9]{7}$' then
    return null;
  end if;
  if p_compter then
    update public.liens_suivis set clics = clics + 1, dernier_clic = now()
     where code = p_code returning url into v_url;
  else
    select l.url into v_url from public.liens_suivis l where l.code = p_code;
  end if;
  return v_url;
end;
$$;
revoke all on function public.lien_suivi_ouvrir(text, boolean) from public;
grant execute on function public.lien_suivi_ouvrir(text, boolean) to anon, authenticated;
