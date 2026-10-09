-- Captures de l'application de l'utilisateur (écrans de son logiciel, de
-- son appli) : les vidéos les montrent dans les scènes « produit » à la
-- place des images lues sur le site. Publiques (le moteur les télécharge et
-- elles finissent dans des vidéos publiées), chacun n'écrit que dans son
-- propre dossier.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('captures', 'captures', true, 6291456, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "captures : lecture de son dossier" on storage.objects
  for select to authenticated
  using (bucket_id = 'captures' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "captures : ajout dans son dossier" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'captures' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "captures : suppression dans son dossier" on storage.objects
  for delete to authenticated
  using (bucket_id = 'captures' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Même ticket de dépôt à usage limité que les vidéos du moteur.
create policy "captures : dépôt du moteur" on storage.objects for insert to anon
  with check (
    bucket_id = 'captures'
    and public.depot_video_valide((storage.foldername(name))[1], (storage.foldername(name))[2])
  );

-- Captures d'un utilisateur, des plus anciennes aux plus récentes (au plus 30).
create function prive.captures_appli(p_user uuid) returns setof text
language sql stable security definer set search_path = '' as $$
  select o.name from storage.objects o
   where o.bucket_id = 'captures'
     and (storage.foldername(o.name))[1] = p_user::text
     and o.name ~* '\.(jpe?g|png|webp)$'
   order by o.created_at, o.name
   limit 30
$$;
revoke all on function prive.captures_appli(uuid) from public;

-- Pour le moteur (vidéos automatiques).
create function public.agent_captures_appli(p_secret text, p_user uuid) returns setof text
language plpgsql stable security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  return query select prive.captures_appli(p_user);
end;
$$;
revoke all on function public.agent_captures_appli(text, uuid) from public, authenticated;
grant execute on function public.agent_captures_appli(text, uuid) to anon;

-- Pour l'utilisateur connecté (page Stratégie et bouton « Créer une vidéo »).
create function public.mes_captures_appli() returns setof text
language sql stable security definer set search_path = '' as $$
  select prive.captures_appli((select auth.uid())) where (select auth.uid()) is not null
$$;
revoke all on function public.mes_captures_appli() from public, anon;
grant execute on function public.mes_captures_appli() to authenticated;
