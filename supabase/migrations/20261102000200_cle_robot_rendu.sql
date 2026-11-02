-- Clé propre au robot de rendu des vidéos animées (GitHub Actions) : les
-- variables Vercel étant sensibles (illisibles), le robot ne reçoit pas la clé
-- du moteur mais une clé limitée à sa file (lire, déposer, terminer).

create or replace function prive.cle_rendu_valide(p_cle text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from prive.secrets where nom = 'rendu_video' and valeur = p_cle)
$$;

create or replace function public.robot_rendus_a_faire(p_cle text)
returns table (tache_id uuid, user_id uuid, titre text, rendu jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not prive.cle_rendu_valide(p_cle) then
    raise exception 'clé invalide';
  end if;
  return query
    select t.id, t.user_id, t.titre, t.resultat -> 'video_rendu'
      from public.taches t
     where t.resultat ->> 'video_etat' = 'a_rendre'
       and t.resultat ->> 'video_url' is null
       and (t.resultat ->> 'video_debut')::timestamptz > now() - interval '60 minutes'
       and t.statut in ('a_valider', 'en_attente')
     order by (t.resultat ->> 'video_debut')::timestamptz
     limit 3;
end;
$$;

-- Ticket de dépôt du MP4, seulement pour une vidéo en attente de rendu.
create or replace function public.robot_rendu_depot(p_cle text, p_tache uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_jeton text := encode(extensions.gen_random_bytes(18), 'hex');
begin
  if not prive.cle_rendu_valide(p_cle) then
    raise exception 'clé invalide';
  end if;
  select t.user_id into v_user from public.taches t
   where t.id = p_tache and t.resultat ->> 'video_etat' = 'a_rendre' and t.resultat ->> 'video_url' is null;
  if v_user is null then
    raise exception 'vidéo non attendue';
  end if;
  insert into prive.depots_video (jeton, user_id) values (v_jeton, v_user);
  return v_jeton;
end;
$$;

-- Fin du rendu : lien du MP4 (dans le stockage du projet) ou échec (retour au
-- montage classique au prochain passage du moteur).
create or replace function public.robot_rendu_fini(p_cle text, p_tache uuid, p_url text, p_erreur text, p_message text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  if not prive.cle_rendu_valide(p_cle) then
    raise exception 'clé invalide';
  end if;
  if p_url is not null and p_url !~ '^https://idabdhnsciymoauyogmj\.supabase\.co/storage/v1/object/public/videos/' then
    raise exception 'lien refusé';
  end if;
  update public.taches t
     set resultat = coalesce(t.resultat, '{}'::jsonb) || case
           when p_url is not null then jsonb_build_object('video_url', p_url, 'video_etat', 'prete', 'video_le', now(), 'video_erreur', null)
           else jsonb_build_object('video_etat', null, 'video_erreur', left(p_erreur, 300))
         end
   where t.id = p_tache and t.resultat ->> 'video_etat' = 'a_rendre'
  returning t.user_id into v_user;
  if v_user is not null then
    insert into public.evenements_taches (tache_id, user_id, niveau, message)
    values (p_tache, v_user, case when p_url is null then 'erreur' else 'info' end, left(p_message, 300));
  end if;
end;
$$;

revoke all on function prive.cle_rendu_valide(text) from public;
revoke all on function public.robot_rendus_a_faire(text) from public, authenticated;
revoke all on function public.robot_rendu_depot(text, uuid) from public, authenticated;
revoke all on function public.robot_rendu_fini(text, uuid, text, text, text) from public, authenticated;
grant execute on function public.robot_rendus_a_faire(text) to anon;
grant execute on function public.robot_rendu_depot(text, uuid) to anon;
grant execute on function public.robot_rendu_fini(text, uuid, text, text, text) to anon;

-- La valeur de la clé est créée à part (jamais dans le dépôt) :
-- insert into prive.secrets (nom, valeur) values ('rendu_video', <aléatoire>).
