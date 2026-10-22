-- Mode croissance : contenu utile d'abord (piliers sans publicité, accroches
-- courtes, appels à l'engagement), carrousels (Instagram, TikTok en photos,
-- LinkedIn en document), Trial Reels et premier commentaire. Activé par
-- utilisateur à partir d'un jour donné (Réglages).

alter table public.reglages_agent add column if not exists croissance_depuis date;

create or replace function public.agent_croissance(p_secret text, p_user uuid, p_jour date)
returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  return exists (
    select 1 from public.reglages_agent r
     where r.user_id = p_user and r.croissance_depuis is not null and r.croissance_depuis <= p_jour
  );
end;
$$;
revoke all on function public.agent_croissance(text, uuid, date) from public, authenticated;
grant execute on function public.agent_croissance(text, uuid, date) to anon;

-- Planification du jour : le pilote peut joindre des champs de résultat à
-- chaque tâche (pilier, format carrousel, Trial Reel). Le reste est inchangé.
create or replace function public.agent_planifier_jour(p_secret text, p_user uuid, p_jour date, p_taches jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_validation boolean;
  v_n int := 0;
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  if p_jour <> (now() at time zone 'Europe/Paris')::date then
    raise exception 'jour invalide';
  end if;
  if jsonb_typeof(p_taches) <> 'array' or jsonb_array_length(p_taches) > 60 then
    raise exception 'taches invalides';
  end if;

  update public.reglages_agent
     set derniere_planification = p_jour
   where user_id = p_user and agent_actif and autopilote
     and (derniere_planification is null or derniere_planification < p_jour)
  returning validation_requise into v_validation;
  if not found then
    return 0;
  end if;

  insert into public.taches (user_id, type, plateforme, marche, titre, consigne, statut, planifiee_pour, resultat)
  select p_user, 'publication', x ->> 'plateforme', prive.marche_valide(x ->> 'marche'),
         left(x ->> 'titre', 200), left(coalesce(x ->> 'consigne', ''), 4000),
         case when v_validation then 'a_valider' else 'en_attente' end,
         (x ->> 'planifiee_pour')::timestamptz,
         jsonb_build_object('source', 'pilote')
           || case when jsonb_typeof(x -> 'resultat') = 'object' then x -> 'resultat' else '{}'::jsonb end
    from jsonb_array_elements(p_taches) x
   where coalesce(x ->> 'titre', '') <> ''
     and (x ->> 'planifiee_pour')::timestamptz between now() - interval '1 hour' and now() + interval '1 day'
     and ((x ->> 'plateforme') = 'facebook_groupe' or exists (
       select 1 from public.comptes_connectes c
        where c.user_id = p_user and c.plateforme = x ->> 'plateforme' and c.statut = 'connecte'
          and (c.marche = prive.marche_valide(x ->> 'marche') or prive.marche_valide(x ->> 'marche') = any (c.langues_en_plus))
     ))
     and not exists (
       select 1 from public.taches t
        where t.user_id = p_user and t.type = 'publication' and t.plateforme = x ->> 'plateforme'
          and prive.marche_valide(t.marche) = prive.marche_valide(x ->> 'marche')
          and t.statut not in ('annulee', 'echouee')
          and t.planifiee_pour between (x ->> 'planifiee_pour')::timestamptz - interval '1 hour'
                                   and (x ->> 'planifiee_pour')::timestamptz + interval '1 hour'
     );
  get diagnostics v_n = row_count;

  if v_n > 0 then
    insert into public.evenements_taches (tache_id, user_id, niveau, message)
    values (
      null, p_user, 'action',
      format('🗓️ Pilote automatique : %s publication%s planifiée%s pour aujourd''hui', v_n,
             case when v_n > 1 then 's' else '' end, case when v_n > 1 then 's' else '' end)
      || case when v_validation then ' (à valider dans Publications).' else '.' end
    );
  end if;
  return v_n;
end;
$$;

-- Publications à envoyer (remplace agent_publications_dues) : chaque tâche est
-- RÉSERVÉE (passée « en cours ») au moment où elle est prise, pour que deux
-- passages du moteur ne la publient jamais deux fois. Un carrousel attend ses
-- diapositives ; sur TikTok, un carrousel prêt remplace la vidéo. Le résultat
-- complet est joint (carrousel, Trial Reel…).
create or replace function public.agent_publications_a_envoyer(p_secret text)
returns table (tache_id uuid, user_id uuid, plateforme text, titre text, consigne text, brouillon text,
               visuel_url text, video_url text, compte_externe_id text, cible_urn text, fournisseur text,
               contexte text, marche text, resultat jsonb)
language plpgsql security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  return query
    with dues as (
      select t.id
        from public.taches t
        join public.reglages_agent r on r.user_id = t.user_id and r.agent_actif
       where t.statut = 'en_attente'
         and t.type = 'publication'
         and (t.planifiee_pour is null or t.planifiee_pour <= now())
         and (
           coalesce(t.resultat ->> 'format', '') <> 'carrousel'
           or t.resultat ? 'carrousel'
           or t.resultat ->> 'carrousel_etat' = 'echec'
         )
         and (
           t.plateforme is distinct from 'tiktok'
           or t.resultat ->> 'video_url' is not null
           or t.resultat ? 'carrousel'
         )
       order by coalesce(t.planifiee_pour, t.created_at)
       limit 5
       for update of t skip locked
    ),
    pris as (
      update public.taches t
         set statut = 'en_cours'
        from dues
       where t.id = dues.id
      returning t.id, t.user_id, t.plateforme, t.titre, t.consigne, t.resultat, t.marche, t.planifiee_pour, t.created_at
    )
    select p.id, p.user_id, p.plateforme, p.titre, p.consigne,
           p.resultat ->> 'brouillon',
           p.resultat ->> 'visuel_url',
           p.resultat ->> 'video_url',
           c.compte_externe_id,
           c.cible_urn,
           c.fournisseur,
           prive.contexte_marque(p.user_id),
           prive.marche_valide(p.marche),
           p.resultat
      from pris p
      left join lateral (
        select cc.compte_externe_id, cc.cible_urn, cc.fournisseur from public.comptes_connectes cc
         where cc.user_id = p.user_id and cc.plateforme = p.plateforme and cc.statut = 'connecte'
           and (cc.marche = prive.marche_valide(p.marche) or prive.marche_valide(p.marche) = any (cc.langues_en_plus))
         order by (cc.marche = prive.marche_valide(p.marche)) desc, (cc.fournisseur <> 'zernio') desc, cc.created_at desc limit 1
      ) c on true
     order by coalesce(p.planifiee_pour, p.created_at);
end;
$$;
revoke all on function public.agent_publications_a_envoyer(text) from public, authenticated;
grant execute on function public.agent_publications_a_envoyer(text) to anon;

-- Carrousels à fabriquer : un par passage, les plus proches d'abord, une fois
-- le texte écrit.
create or replace function public.agent_carrousels_a_faire(p_secret text)
returns table (tache_id uuid, user_id uuid, plateforme text, titre text, consigne text, brouillon text,
               contexte text, essais integer, marche text)
language plpgsql security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  return query
    select t.id, t.user_id, t.plateforme, t.titre, t.consigne,
           t.resultat ->> 'brouillon',
           prive.contexte_marque(t.user_id),
           coalesce((t.resultat ->> 'essais_carrousel')::int, 0),
           prive.marche_valide(t.marche)
      from public.taches t
      join public.reglages_agent r on r.user_id = t.user_id and r.agent_actif
     where t.type = 'publication'
       and t.statut in ('a_valider', 'en_attente')
       and t.resultat ->> 'format' = 'carrousel'
       and coalesce(t.resultat ->> 'brouillon', '') <> ''
       and not (t.resultat ? 'carrousel')
       and (
         t.resultat ->> 'carrousel_etat' is null
         or (t.resultat ->> 'carrousel_etat' = 'en_cours' and (t.resultat ->> 'carrousel_debut')::timestamptz < now() - interval '10 minutes')
       )
       and coalesce((t.resultat ->> 'essais_carrousel')::int, 0) < 2
     order by coalesce(t.planifiee_pour, t.created_at)
     limit 1;
end;
$$;
revoke all on function public.agent_carrousels_a_faire(text) from public, authenticated;
grant execute on function public.agent_carrousels_a_faire(text) to anon;

-- Dépôt par le moteur (ticket à durée limitée, comme les vidéos) : les
-- diapositives JPEG dans « studio », le document PDF dans « documents ».
create policy "studio : dépôt du moteur" on storage.objects for insert to anon
  with check (
    bucket_id = 'studio'
    and public.depot_video_valide((storage.foldername(name))[1], (storage.foldername(name))[2])
  );
create policy "documents : dépôt du moteur" on storage.objects for insert to anon
  with check (
    bucket_id = 'documents'
    and public.depot_video_valide((storage.foldername(name))[1], (storage.foldername(name))[2])
  );
