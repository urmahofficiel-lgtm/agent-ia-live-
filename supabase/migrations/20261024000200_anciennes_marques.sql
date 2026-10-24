-- Anciennes marques du compte : quand la fiche change de nom (un autre projet
-- analysé par erreur, un changement de nom), l'ancien nom et l'ancien site
-- sont retenus. La fiche donnée à l'IA les liste comme marques à ne jamais
-- citer, et les textes qui les citent sont refusés.

alter table public.profil_marque
  add column if not exists anciennes_marques text[] not null default '{}';

create or replace function prive.retenir_ancienne_marque()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_anciens text[] := coalesce(new.anciennes_marques, '{}');
  v_hote text;
begin
  if coalesce(old.nom, '') <> '' and lower(old.nom) is distinct from lower(coalesce(new.nom, '')) then
    v_anciens := array_append(v_anciens, old.nom);
  end if;
  v_hote := substring(coalesce(old.site, '') from '^(?:https?://)?(?:www\.)?([^/?#]+)');
  if coalesce(v_hote, '') <> ''
     and v_hote is distinct from substring(coalesce(new.site, '') from '^(?:https?://)?(?:www\.)?([^/?#]+)') then
    v_anciens := array_append(v_anciens, v_hote);
  end if;
  -- Sans doublon, et jamais le nom ou le site actuels.
  new.anciennes_marques := coalesce((
    select array_agg(distinct a) from unnest(v_anciens) a
     where lower(a) <> lower(coalesce(new.nom, ''))
       and lower(a) is distinct from lower(substring(coalesce(new.site, '') from '^(?:https?://)?(?:www\.)?([^/?#]+)'))
  ), '{}');
  return new;
end;
$$;

drop trigger if exists retenir_ancienne_marque on public.profil_marque;
create trigger retenir_ancienne_marque
  before update on public.profil_marque
  for each row execute function prive.retenir_ancienne_marque();

-- Le compte dont la fiche a été remplacée par « Agora » le 23/10 (ancienne
-- fiche déjà remise : le déclencheur n'a rien pu retenir).
update public.profil_marque
   set anciennes_marques = array['Agora', 'manifestation-organiser.vercel.app']
 where user_id = '1d464cc0-fb73-4412-895c-cb5ef69f3c3f';

-- Fiche donnée à l'IA : + les marques à ne jamais citer.
create or replace function prive.contexte_marque(p_user uuid)
returns text
language sql stable security definer set search_path = '' as $function$
  with t as (
    select x.resume, x.hashtags from public.tendances x
     where x.user_id = p_user and x.jour >= current_date - 3
     order by x.jour desc limit 1
  )
  select concat_ws(E'\n',
    nullif('Marque : ' || coalesce(nullif(p.nom, ''), p.fiche ->> 'nom', ''), 'Marque : '),
    nullif('Autres marques à ne JAMAIS citer (anciennes fiches) : ' || array_to_string(p.anciennes_marques, ', '), 'Autres marques à ne JAMAIS citer (anciennes fiches) : '),
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
    nullif('Hashtags conseillés (ceux que la cible emploie vraiment : choisis-en selon le sujet, n''en invente pas d''autres) : '
      || coalesce((select string_agg(h, ' ') from t, unnest(t.hashtags) h), (select string_agg(h, ' ') from jsonb_array_elements_text(p.analyse_marche -> 'hashtags') h), ''),
      'Hashtags conseillés (ceux que la cible emploie vraiment : choisis-en selon le sujet, n''en invente pas d''autres) : '),
    nullif(E'Tendances de la semaine dans le domaine (veille web : pour choisir le sujet, l''accroche et les mots de la cible ; n''invente rien au-delà) :\n' || coalesce((select t.resume from t), ''),
      E'Tendances de la semaine dans le domaine (veille web : pour choisir le sujet, l''accroche et les mots de la cible ; n''invente rien au-delà) :\n'),
    nullif(
      E'Ce qui marche le mieux auprès de votre audience (statistiques des 30 derniers jours : pour choisir l''angle, le format et le ton ; ce ne sont pas des chiffres à citer) :\n'
        || coalesce((select r.apprentissage ->> 'resume' from public.reglages_agent r where r.user_id = p_user), ''),
      E'Ce qui marche le mieux auprès de votre audience (statistiques des 30 derniers jours : pour choisir l''angle, le format et le ton ; ce ne sont pas des chiffres à citer) :\n'
    )
  )
  from public.profil_marque p where p.user_id = p_user
$function$;

