-- Purge des médias (accord de Younes du 15/11/2026).
--
-- POURQUOI. Les vidéos, animations et fichiers du studio s'accumulaient dans le
-- stockage (1,27 Go pour 1 Go autorisé sur l'offre gratuite de Supabase).
-- Une fois une publication partie, ses fichiers ne servent plus.
--
-- LE PRINCIPE. Chaque nuit à 04:10 UTC, l'edge function `purge-medias` efface
-- les fichiers de plus de 3 jours, SAUF ceux reliés à :
--   - une publication à venir (statut autre que terminée, annulée, échouée,
--     ou programmée dans le futur) ;
--   - un montage ou un doublage prêt depuis moins de 30 jours, ou en cours ;
--   - une animation ou une vidéo IA en cours ;
--   - la photothèque, les réglages de l'agent et la fiche de marque.
-- La fonction ne touche jamais un fichier de moins de 24 h (un média en cours
-- de fabrication n'est pas encore relié à sa publication).
--
-- L'application de l'agent n'a volontairement aucune clé d'administration :
-- seule l'edge function (clé de service) peut effacer. Elle lit la liste par
-- `purge_medias_candidats`, réservée au rôle service_role.
--
-- Première purge faite à la main le 15/11/2026 avec { avant: 2026-11-01 } :
-- 511 fichiers, 981 Mo, aucun fichier d'une publication à venir touché.

insert into prive.secrets (nom, valeur)
select 'purge_medias', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
 where not exists (select 1 from prive.secrets where nom = 'purge_medias');

create or replace function prive.medias_a_purger(p_avant timestamptz, p_limite int default 500)
returns table (bucket text, nom text, taille bigint)
language sql stable security definer set search_path = '' as $$
  with garde as (
    select t::text as txt from public.taches t
     where t.statut not in ('terminee', 'annulee', 'echouee') or t.planifiee_pour > now()
    union all select m::text from public.montages m
     where m.statut <> 'echec' and (m.statut <> 'pret' or m.created_at > now() - interval '30 days')
    union all select d::text from public.doublages d
     where d.statut <> 'echec' and (d.statut <> 'pret' or d.created_at > now() - interval '30 days')
    union all select a::text from public.animations a where a.statut not in ('terminee', 'echec', 'erreur')
    union all select v::text from public.videos_ia v where v.statut not in ('terminee', 'echec', 'erreur')
    union all select p::text from public.phototheque p
    union all select r::text from public.reglages_agent r
    union all select b::text from public.profil_marque b
  )
  select o.bucket_id::text, o.name::text, coalesce((o.metadata ->> 'size')::bigint, 0)
    from storage.objects o
   where o.bucket_id in ('videos', 'studio', 'animations')
     and o.created_at < p_avant
     and not exists (
       select 1 from garde g
        where position(case when o.bucket_id = 'studio' then regexp_replace(o.name, '/[^/]*$', '') else o.name end in g.txt) > 0)
   order by o.created_at
   limit greatest(1, least(coalesce(p_limite, 500), 1000));
$$;

create or replace function public.purge_medias_candidats(p_avant timestamptz, p_limite int default 500)
returns table (bucket text, nom text, taille bigint)
language sql stable security definer set search_path = '' as $$
  select * from prive.medias_a_purger(p_avant, p_limite);
$$;

create or replace function public.purge_medias_secret()
returns text
language sql stable security definer set search_path = '' as $$
  select valeur from prive.secrets where nom = 'purge_medias';
$$;

revoke all on function prive.medias_a_purger(timestamptz, int) from public, anon, authenticated;
revoke all on function public.purge_medias_candidats(timestamptz, int) from public, anon, authenticated;
revoke all on function public.purge_medias_secret() from public, anon, authenticated;
grant execute on function public.purge_medias_candidats(timestamptz, int) to service_role;
grant execute on function public.purge_medias_secret() to service_role;

select cron.schedule(
  'agent-purge-medias',
  '10 4 * * *',
  $cmd$
    select net.http_post(
      url     := 'https://idabdhnsciymoauyogmj.supabase.co/functions/v1/purge-medias',
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'Authorization', 'Bearer ' || (select valeur from prive.secrets where nom = 'purge_medias')
                 ),
      body    := '{}'::jsonb,
      timeout_milliseconds := 140000
    );
  $cmd$
);
