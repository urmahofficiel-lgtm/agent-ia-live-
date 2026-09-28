-- Reels automatiques : le moteur (sans session utilisateur) crée la vidéo des
-- publications Facebook et Instagram et la dépose dans le bucket « videos ».
-- Dépôt autorisé par un ticket à usage unique (15 min), délivré contre le
-- secret du moteur : chemin « <user_id>/auto-<ticket>/… ».

create table prive.depots_video (
  jeton text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  expire timestamptz not null default now() + interval '15 minutes'
);

create function public.agent_depot_video(p_secret text, p_user uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_jeton text := encode(extensions.gen_random_bytes(18), 'hex');
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  delete from prive.depots_video where expire < now();
  insert into prive.depots_video (jeton, user_id) values (v_jeton, p_user);
  return v_jeton;
end;
$$;
revoke all on function public.agent_depot_video(text, uuid) from public, authenticated;
grant execute on function public.agent_depot_video(text, uuid) to anon;

-- Utilisée par la règle de stockage : vrai si le dossier correspond à un ticket valide.
create function public.depot_video_valide(p_user text, p_dossier text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from prive.depots_video d
     where d.user_id::text = p_user and 'auto-' || d.jeton = p_dossier and d.expire > now()
  );
$$;
revoke all on function public.depot_video_valide(text, text) from public;
grant execute on function public.depot_video_valide(text, text) to anon;

create policy "videos : dépôt du moteur" on storage.objects for insert to anon
  with check (
    bucket_id = 'videos'
    and public.depot_video_valide((storage.foldername(name))[1], (storage.foldername(name))[2])
  );

-- Publications Facebook et Instagram sans vidéo : le moteur en fabrique une par
-- passage, les plus proches de leur date de publication d'abord.
create function public.agent_videos_a_faire(p_secret text)
returns table (tache_id uuid, user_id uuid, plateforme text, titre text, consigne text, brouillon text, contexte text, site text, essais int)
language plpgsql security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  return query
    select t.id, t.user_id, t.plateforme, t.titre, t.consigne,
           t.resultat ->> 'brouillon',
           prive.contexte_marque(t.user_id),
           (select pm.site from public.profil_marque pm where pm.user_id = t.user_id),
           coalesce((t.resultat ->> 'essais_video')::int, 0)
    from public.taches t
    join public.reglages_agent r on r.user_id = t.user_id and r.agent_actif
    where t.type = 'publication'
      and t.plateforme in ('facebook', 'instagram')
      and t.statut in ('a_valider', 'en_attente')
      and coalesce(t.resultat ->> 'brouillon', '') <> ''
      and t.resultat ->> 'video_url' is null
      and (
        t.resultat ->> 'video_etat' is null
        -- création interrompue depuis plus de 10 min : on retente
        or (t.resultat ->> 'video_etat' = 'en_cours' and (t.resultat ->> 'video_debut')::timestamptz < now() - interval '10 minutes')
      )
      and coalesce((t.resultat ->> 'essais_video')::int, 0) < 2
    order by coalesce(t.planifiee_pour, t.created_at)
    limit 1;
end;
$$;
revoke all on function public.agent_videos_a_faire(text) from public, authenticated;
grant execute on function public.agent_videos_a_faire(text) to anon;
