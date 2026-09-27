-- Fiche marque : ce que le site dit réellement (nom, fonctionnalités, preuves,
-- tarifs, lien d'appel à l'action, univers visuel). Chaque publication et
-- chaque image s'appuient dessus, pour promouvoir LA marque sans rien inventer.
alter table public.profil_marque
  add column nom text not null default '',
  add column fiche jsonb,
  add column extrait_site text;

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
    nullif('Hashtags conseillés : ' || coalesce((select string_agg(h, ' ') from jsonb_array_elements_text(p.analyse_marche -> 'hashtags') h), ''), 'Hashtags conseillés : ')
  )
  from public.profil_marque p where p.user_id = p_user
$$;
