-- Prospection : l'annuaire officiel des entreprises (INSEE / RNE) complète
-- OpenStreetMap. SIRET pour ne pas ajouter deux fois la même entreprise, et
-- un résumé (ancienneté, taille, RGE) pour personnaliser le message.

alter table public.prospects
  add column siret text,
  add column infos text;   -- ex. « SIRET 412 660 508 00257 · créée en 1997 · 10 à 19 salariés · certifiée RGE »

create unique index prospects_user_siret_idx on public.prospects (user_id, siret) where siret is not null;

create or replace function prive.ajouter_prospects(p_user uuid, p_categorie text, p_ville text, p_liste jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ajoutes int;
  v_trouves int := jsonb_array_length(coalesce(p_liste, '[]'::jsonb));
begin
  with brut as (
    select distinct on (lower(btrim(x.nom))) x.*
      from jsonb_to_recordset(coalesce(p_liste, '[]'::jsonb))
           as x(nom text, email text, telephone text, site text, adresse text, osm_id text, siret text, infos text, origine text)
     where coalesce(btrim(x.nom), '') <> ''
     limit 200
  ), inseres as (
    insert into public.prospects (user_id, type, nom, entreprise, email, telephone, site, adresse, osm_id, siret, infos, categorie, source)
    select p_user, 'entreprise', left(b.nom, 200), left(b.nom, 200), left(b.email, 200), left(b.telephone, 50),
           left(b.site, 300), left(b.adresse, 300), left(b.osm_id, 50),
           case when b.siret ~ '^\d{14}$' then b.siret end, left(b.infos, 300), left(p_categorie, 100),
           left(case when b.origine = 'annuaire' then 'Annuaire des entreprises' else 'OpenStreetMap' end
                || ' · ' || p_categorie || ' · ' || p_ville, 200)
      from brut b
     where not exists (
       select 1 from public.prospects p
        where p.user_id = p_user
          and (lower(p.nom) = lower(btrim(b.nom))
               or (b.osm_id is not null and p.osm_id = b.osm_id)
               or (b.siret is not null and p.siret = b.siret))
     )
    on conflict do nothing
    returning 1
  )
  select count(*) into v_ajoutes from inseres;

  insert into public.evenements_taches (user_id, niveau, message)
  values (p_user, 'info', format('Prospection : %s %s trouvé(s) à %s, %s nouveau(x) ajouté(s) au CRM.',
                                 v_trouves, lower(p_categorie), p_ville, v_ajoutes));
  return jsonb_build_object('trouves', v_trouves, 'ajoutes', v_ajoutes);
end;
$$;

create or replace function prive.prospect_a_rediger(p_user uuid, p_id uuid, p_relance boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.prospects;
begin
  select * into p from public.prospects where id = p_id and user_id = p_user;
  if p.id is null then raise exception 'prospect introuvable'; end if;
  if p.statut = 'ne_plus_contacter' then raise exception 'prospect oppose : ne plus contacter'; end if;
  if p.statut in ('refus', 'client') then raise exception 'prospect deja client ou a refuse'; end if;
  if p.type = 'particulier' and not p.consentement then raise exception 'particulier sans consentement'; end if;
  return jsonb_build_object(
    'id', p.id, 'nom', p.nom, 'entreprise', p.entreprise, 'categorie', p.categorie,
    'adresse', coalesce(p.adresse, p.notes), 'source', p.source, 'email', p.email,
    'telephone', p.telephone, 'site', p.site, 'statut', p.statut, 'infos', p.infos,
    'genre', case when coalesce(p_relance, false) or p.statut in ('contacte', 'relance') then 'relance' else 'premier' end,
    'dernier_contact_at', p.dernier_contact_at,
    'dernier_message', (select i.contenu from public.interactions_prospects i
                         where i.prospect_id = p.id and i.sens = 'sortant'
                         order by i.created_at desc limit 1),
    'contexte', prive.contexte_marque(p_user)
  );
end;
$$;
