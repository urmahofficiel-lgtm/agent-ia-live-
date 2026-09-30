-- Statistiques des publications + apprentissage.
-- Toutes les heures (pg_cron → /api/agent/stats), le moteur relit les stats
-- des posts publiés depuis 30 jours (taches.resultat.stats) puis enregistre,
-- par utilisateur, un résumé de ce qui marche (reglages_agent.apprentissage).
-- Ce résumé est lu par la rédaction (prive.contexte_marque) et par le
-- planificateur automatique (champ « resume »).

alter table public.reglages_agent add column if not exists apprentissage jsonb;

-- Posts à relire : publiés depuis 30 jours, jamais lus ou lus il y a
-- longtemps (45 min la première semaine, 12 h ensuite). Le compte renvoyé est
-- celui qu'utilise le moteur pour publier (connexion directe d'abord).
create function public.agent_stats_a_faire(p_secret text, p_limite int)
returns table (tache_id uuid, user_id uuid, plateforme text, post_id text, fournisseur text, compte_externe_id text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  return query
    select t.id, t.user_id, t.plateforme, t.resultat ->> 'post_id', c.fournisseur, c.compte_externe_id
    from public.taches t
    left join lateral (
      select cc.fournisseur, cc.compte_externe_id from public.comptes_connectes cc
       where cc.user_id = t.user_id and cc.plateforme = t.plateforme and cc.statut = 'connecte'
       order by (cc.fournisseur <> 'zernio') desc, cc.created_at desc limit 1
    ) c on true
    where t.type = 'publication'
      and t.statut = 'terminee'
      and coalesce(t.resultat ->> 'post_id', '') <> ''
      and (t.resultat ->> 'publie_le')::timestamptz > now() - interval '30 days'
      and (
        t.resultat -> 'stats' ->> 'maj' is null
        or ((t.resultat ->> 'publie_le')::timestamptz > now() - interval '7 days'
            and (t.resultat -> 'stats' ->> 'maj')::timestamptz < now() - interval '45 minutes')
        or (t.resultat -> 'stats' ->> 'maj')::timestamptz < now() - interval '12 hours'
      )
    order by (t.resultat -> 'stats' ->> 'maj') nulls first, t.resultat ->> 'publie_le' desc
    limit least(greatest(coalesce(p_limite, 100), 1), 500);
end;
$$;
revoke all on function public.agent_stats_a_faire(text, int) from public, authenticated;
grant execute on function public.agent_stats_a_faire(text, int) to anon;

-- Enregistre resultat.stats (fusion : une erreur de lecture garde les
-- dernières valeurs connues). Ne touche à rien d'autre.
create function public.agent_enregistrer_stats(p_secret text, p_tache_id uuid, p_stats jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  update public.taches
     set resultat = coalesce(resultat, '{}'::jsonb)
                    || jsonb_build_object('stats', coalesce(resultat -> 'stats', '{}'::jsonb) || coalesce(p_stats, '{}'::jsonb))
   where id = p_tache_id and type = 'publication' and statut = 'terminee';
end;
$$;
revoke all on function public.agent_enregistrer_stats(text, uuid, jsonb) from public, authenticated;
grant execute on function public.agent_enregistrer_stats(text, uuid, jsonb) to anon;

-- Publications mesurées des 30 derniers jours, pour calculer l'apprentissage.
create function public.agent_publications_stats(p_secret text)
returns table (user_id uuid, titre text, plateforme text, publie_le text, video boolean, video_style text, visuel_style text, stats jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  return query
    select t.user_id, t.titre, t.plateforme, t.resultat ->> 'publie_le',
           coalesce(t.resultat ->> 'video_url', '') <> '',
           t.resultat ->> 'video_style', t.resultat ->> 'visuel_style', t.resultat -> 'stats'
    from public.taches t
    where t.type = 'publication'
      and t.statut = 'terminee'
      and t.resultat -> 'stats' ->> 'maj' is not null
      and (t.resultat ->> 'publie_le')::timestamptz > now() - interval '30 days'
    order by t.user_id
    limit 5000;
end;
$$;
revoke all on function public.agent_publications_stats(text) from public, authenticated;
grant execute on function public.agent_publications_stats(text) to anon;

create function public.agent_enregistrer_apprentissage(p_secret text, p_user uuid, p_apprentissage jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  insert into public.reglages_agent (user_id, apprentissage) values (p_user, p_apprentissage)
  on conflict (user_id) do update set apprentissage = excluded.apprentissage;
end;
$$;
revoke all on function public.agent_enregistrer_apprentissage(text, uuid, jsonb) from public, authenticated;
grant execute on function public.agent_enregistrer_apprentissage(text, uuid, jsonb) to anon;

-- Contexte de marque (dernière version : 20260927000300_fiche_marque.sql),
-- complété par le résumé d'apprentissage.
create or replace function prive.contexte_marque(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select concat_ws(E'\n',
    nullif('Marque : ' || coalesce(nullif(p.nom, ''), p.fiche ->> 'nom', ''), 'Marque : '),
    nullif('Site / lien à mettre dans les posts : ' || coalesce(nullif(p.fiche ->> 'lien_cta', ''), p.site), 'Site / lien à mettre dans les posts : '),
    nullif('Slogan : ' || coalesce(p.fiche ->> 'slogan', ''), 'Slogan : '),
    nullif('Activité : ' || p.activite, 'Activité : '),
    nullif('Offre : ' || p.offre, 'Offre : '),
    nullif('Fonctionnalités / produits réels : ' || coalesce((select string_agg(x, ' ; ') from jsonb_array_elements_text(p.fiche -> 'fonctionnalites') x), ''), 'Fonctionnalités / produits réels : '),
    nullif('Bénéfices clients : ' || coalesce((select string_agg(x, ' ; ') from jsonb_array_elements_text(p.fiche -> 'benefices') x), ''), 'Bénéfices clients : '),
    nullif('Preuves et chiffres AFFICHÉS sur le site (les seuls utilisables) : ' || coalesce((select string_agg(x, ' ; ') from jsonb_array_elements_text(p.fiche -> 'preuves') x), ''), 'Preuves et chiffres AFFICHÉS sur le site (les seuls utilisables) : '),
    nullif('Tarifs : ' || coalesce(p.fiche ->> 'tarifs', ''), 'Tarifs : '),
    nullif('Appel à l''action : ' || coalesce(p.fiche ->> 'appel_action', ''), 'Appel à l''action : '),
    nullif('Clientèle visée : ' || p.cible, 'Clientèle visée : '),
    nullif('Zone : ' || p.zone, 'Zone : '),
    nullif('Ton souhaité : ' || p.ton, 'Ton souhaité : '),
    nullif('Objectif : ' || p.objectif, 'Objectif : '),
    nullif('Univers visuel (décors, personnes, objets à montrer) : ' || coalesce(p.fiche ->> 'univers_visuel', ''), 'Univers visuel (décors, personnes, objets à montrer) : '),
    nullif('Niche (analyse) : ' || coalesce(p.analyse_marche ->> 'resume_niche', ''), 'Niche (analyse) : '),
    nullif('Positionnement : ' || coalesce(p.analyse_marche ->> 'positionnement', ''), 'Positionnement : '),
    nullif('Hashtags conseillés : ' || coalesce((select string_agg(h, ' ') from jsonb_array_elements_text(p.analyse_marche -> 'hashtags') h), ''), 'Hashtags conseillés : '),
    nullif(
      E'Ce qui marche le mieux auprès de votre audience (statistiques des 30 derniers jours : pour choisir l''angle, le format et le ton ; ce ne sont pas des chiffres à citer) :\n'
        || coalesce((select r.apprentissage ->> 'resume' from public.reglages_agent r where r.user_id = p_user), ''),
      E'Ce qui marche le mieux auprès de votre audience (statistiques des 30 derniers jours : pour choisir l''angle, le format et le ton ; ce ne sont pas des chiffres à citer) :\n'
    )
  )
  from public.profil_marque p where p.user_id = p_user
$$;

-- Connecteur MCP : statistiques et apprentissage (lecture seule).
create function public.mcp_statistiques(p_secret text, p_empreinte text, p_jours int)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_jours int := least(greatest(coalesce(p_jours, 30), 1), 90);
begin
  if not prive.secret_valide(p_secret) then raise exception 'secret invalide'; end if;
  v_user := prive.utilisateur_connecteur(p_empreinte);
  return jsonb_build_object(
    'periode_jours', v_jours,
    'apprentissage', (select r.apprentissage from public.reglages_agent r where r.user_id = v_user),
    'par_reseau', coalesce((
      select jsonb_agg(x order by x.publications desc)
        from (
          select t.plateforme as reseau, count(*) as publications,
                 sum((t.resultat -> 'stats' ->> 'vues')::numeric) as vues,
                 sum((t.resultat -> 'stats' ->> 'likes')::numeric) as likes,
                 sum((t.resultat -> 'stats' ->> 'commentaires')::numeric) as commentaires,
                 sum((t.resultat -> 'stats' ->> 'partages')::numeric) as partages
            from public.taches t
           where t.user_id = v_user and t.type = 'publication' and t.statut = 'terminee'
             and (t.resultat ->> 'publie_le')::timestamptz > now() - make_interval(days => v_jours)
           group by t.plateforme
        ) x
    ), '[]'::jsonb),
    'publications', coalesce((
      select jsonb_agg(x order by x.publiee_le desc)
        from (
          select t.id, t.titre, t.plateforme as reseau, t.resultat ->> 'publie_le' as publiee_le,
                 coalesce(t.resultat ->> 'video_url', '') <> '' as video,
                 t.resultat -> 'stats' as stats
            from public.taches t
           where t.user_id = v_user and t.type = 'publication' and t.statut = 'terminee'
             and (t.resultat ->> 'publie_le')::timestamptz > now() - make_interval(days => v_jours)
           order by t.resultat ->> 'publie_le' desc
           limit 50
        ) x
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.mcp_statistiques(text, text, int) from public, authenticated;
grant execute on function public.mcp_statistiques(text, text, int) to anon;
