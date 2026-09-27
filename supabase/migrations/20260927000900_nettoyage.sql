-- Nettoyage : une publication supprimée emporte ses images, les images qui ne
-- servent plus sont effacées, et les fonctions du moteur ne sont appelables
-- que par lui (rôle anon + secret), plus par les utilisateurs connectés.
alter table public.visuels drop constraint visuels_tache_id_fkey;
alter table public.visuels
  add constraint visuels_tache_id_fkey foreign key (tache_id) references public.taches (id) on delete cascade;

-- Images orphelines (remplacées par « Nouvelle image » ou sans publication).
delete from public.visuels v
 where not exists (
   select 1 from public.taches t
    where t.resultat ->> 'visuel_url' like '%' || v.id::text || '%'
 );

drop function if exists public.meta_jeton(text, uuid, text);

revoke execute on function public.agent_ajouter_visuel(text, uuid, text, text, text) from authenticated;
revoke execute on function public.agent_brouillons_a_faire(text) from authenticated;
revoke execute on function public.agent_maj_tache(text, uuid, text, jsonb, text, text) from authenticated;
revoke execute on function public.agent_taches_dues(text) from authenticated;
revoke execute on function public.compte_jeton(text, uuid, text) from authenticated;
revoke execute on function public.compte_maj_jeton(text, uuid, text, text) from authenticated;
revoke execute on function public.instagram_enregistrer_compte(text, uuid, text, text, text) from authenticated;
revoke execute on function public.meta_enregistrer_comptes(text, uuid, jsonb) from authenticated;
-- Réservée aux utilisateurs connectés (renvoie leur propre contexte).
revoke execute on function public.mon_contexte_marque() from anon;
