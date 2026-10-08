-- Prospection hors de France. Chaque prospect a un pays (FR par défaut).
-- E-mail sans accord préalable : France (adresses professionnelles) et
-- Belgique, mais seulement vers une adresse impersonnelle d'entreprise
-- (contact@, info@…). Ailleurs (Allemagne, Espagne, Italie…) l'accord
-- préalable est exigé même entre entreprises : aucun e-mail de prospection.

alter table public.prospects
  add column pays text not null default 'FR' check (pays ~ '^[A-Z]{2}$');

-- Même liste que emailImpersonnel() (src/lib/prospection.ts).
create or replace function prive.email_impersonnel(p_email text) returns boolean
language sql immutable set search_path = '' as $$
  select split_part(split_part(lower(btrim(coalesce(p_email, ''))), '@', 1), '.', 1) <> ''
     and regexp_replace(split_part(lower(btrim(coalesce(p_email, ''))), '@', 1), '[.+_-].*$', '') = any (array[
       'contact', 'info', 'infos', 'bureau', 'secretariat', 'secretaria', 'agence', 'office',
       'accueil', 'admin', 'administration', 'hello', 'bonjour', 'mail', 'studio', 'atelier',
       'projets', 'projet', 'direction', 'reception', 'team', 'equipe', 'general', 'courrier'])
$$;

create or replace function prive.prospection_email_permise(p_pays text, p_email text) returns boolean
language sql immutable set search_path = '' as $$
  select case coalesce(p_pays, 'FR')
           when 'FR' then true
           when 'BE' then prive.email_impersonnel(p_email)
           else false
         end
$$;

create or replace function public.agent_emails_a_traiter(p_secret text)
returns table (prospect_id uuid, user_id uuid, relance boolean, validation boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  return query
    with u as (
      select r.user_id, r.email_validation, r.relance_apres_jours, nullif(btrim(r.email_cible), '') as cible,
             least(r.email_par_jour - prive.emails_envoyes_aujourdhui(r.user_id), prive.contacts_restants(r.user_id), 3)
               - case when r.email_validation then
                   (select count(*)::int from public.prospects b
                     where b.user_id = r.user_id and b.brouillon ->> 'canal' = 'email')
                 else 0 end as quota
        from public.reglages_agent r
       where r.agent_actif and r.email_auto and coalesce(r.email_expediteur, '') <> ''
    ), candidats as (
      select p.id, p.user_id, (p.statut = 'contacte') as relance, u.email_validation,
             row_number() over (partition by p.user_id order by (p.statut = 'contacte') desc, p.created_at) as rang,
             u.quota
        from public.prospects p
        join u on u.user_id = p.user_id
       where p.type = 'entreprise'
         and coalesce(p.email, '') <> '' and not p.email_invalide
         and (u.cible is null or p.categorie ilike '%' || u.cible || '%')
         and prive.prospection_email_permise(p.pays, p.email)
         and (p.brouillon is null or (not u.email_validation and p.brouillon ->> 'canal' = 'email'))
         and (p.statut = 'nouveau'
              or (p.statut = 'contacte' and p.dernier_contact_at <= now() - make_interval(days => u.relance_apres_jours)))
    )
    select c.id, c.user_id, c.relance, c.email_validation from candidats c where c.rang <= c.quota;
end;
$$;

create or replace function public.agent_email_a_envoyer(p_secret text, p_user uuid, p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  p public.prospects;
  r public.reglages_agent;
begin
  if not prive.secret_valide(p_secret) then raise exception 'secret invalide'; end if;
  select * into p from public.prospects where id = p_id and user_id = p_user;
  if p.id is null then raise exception 'prospect introuvable'; end if;
  if p.statut = 'ne_plus_contacter' then raise exception 'prospect oppose : ne plus contacter'; end if;
  if p.statut in ('refus', 'client') then raise exception 'prospect deja client ou a refuse'; end if;
  if p.type <> 'entreprise' then raise exception 'particulier sans consentement'; end if;
  if p.email_invalide or coalesce(p.email, '') = '' then raise exception 'adresse e-mail invalide'; end if;
  if coalesce(p.brouillon ->> 'canal', '') <> 'email' then raise exception 'aucun e-mail a envoyer'; end if;
  if not prive.prospection_email_permise(p.pays, p.email) then
    raise exception 'prospection par e-mail non autorisee sans accord prealable (pays % ou adresse nominative)', p.pays;
  end if;
  select * into r from public.reglages_agent where user_id = p_user;
  if coalesce(r.email_expediteur, '') = '' then raise exception 'adresse d''expedition non configuree'; end if;
  if prive.contacts_restants(p_user) <= 0 or prive.emails_envoyes_aujourdhui(p_user) >= r.email_par_jour then
    raise exception 'limite de contacts du jour atteinte';
  end if;
  return jsonb_build_object(
    'email', split_part(split_part(p.email, ';', 1), ',', 1),
    'objet', p.brouillon ->> 'objet',
    'texte', p.brouillon ->> 'texte',
    'genre', p.brouillon ->> 'genre',
    'jeton', p.jeton_desinscription,
    'expediteur', r.email_expediteur,
    'reponse', coalesce(nullif(r.email_reponse, ''), (select u.email from auth.users u where u.id = p_user)),
    'marque', (select nullif(pm.nom, '') from public.profil_marque pm where pm.user_id = p_user),
    'site', (select nullif(pm.site, '') from public.profil_marque pm where pm.user_id = p_user),
    'piece_jointe_url', nullif(r.email_piece_jointe_url, ''),
    'piece_jointe_nom', nullif(r.email_piece_jointe_nom, '')
  );
end;
$$;

create or replace function prive.ajouter_prospects(p_user uuid, p_categorie text, p_ville text, p_liste jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ajoutes int;
  v_trouves int := jsonb_array_length(coalesce(p_liste, '[]'::jsonb));
begin
  with brut as (
    select distinct on (lower(btrim(x.nom))) x.*
      from jsonb_to_recordset(coalesce(p_liste, '[]'::jsonb))
           as x(nom text, email text, telephone text, site text, adresse text, osm_id text, siret text, infos text, origine text, pays text)
     where coalesce(btrim(x.nom), '') <> ''
     limit 200
  ), inseres as (
    insert into public.prospects (user_id, type, nom, entreprise, email, telephone, site, adresse, osm_id, siret, infos, categorie, source, pays)
    select p_user, 'entreprise', left(b.nom, 200), left(b.nom, 200), left(b.email, 200), left(b.telephone, 50),
           left(b.site, 300), left(b.adresse, 300), left(b.osm_id, 50),
           case when b.siret ~ '^\d{14}$' then b.siret end, left(b.infos, 300), left(p_categorie, 100),
           left(case when b.origine = 'annuaire' then 'Annuaire des entreprises' else 'OpenStreetMap' end
                || ' · ' || p_categorie || ' · ' || p_ville, 200),
           case when upper(b.pays) ~ '^[A-Z]{2}$' then upper(b.pays) else 'FR' end
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
    'contexte', prive.contexte_marque(p_user),
    'pays', p.pays
  );
end;
$$;
