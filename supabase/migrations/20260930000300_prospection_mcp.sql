-- Prospection utile et sûre + outils du connecteur MCP.
--
-- Principe : l'agent TROUVE des entreprises (OpenStreetMap) et RÉDIGE un
-- message personnalisé ; il n'envoie jamais rien. L'utilisateur relit, envoie
-- lui-même (e-mail, téléphone, WhatsApp) puis marque le prospect « contacté ».
-- Les garde-fous (opposition, limite de contacts par jour, consentement des
-- particuliers) sont vérifiés ici, côté base, quel que soit l'appelant
-- (site ou connecteur MCP).

alter table public.prospects
  add column categorie text,   -- métier du prospect (ex. « Boulangeries »), sert à personnaliser le message
  add column adresse text,
  add column osm_id text,      -- identifiant OpenStreetMap, pour ne pas ajouter deux fois la même entreprise
  -- Message à valider : { genre: premier|relance, canal: email|message, objet, texte, redige_le }.
  add column brouillon jsonb;

create unique index prospects_user_osm_idx on public.prospects (user_id, osm_id) where osm_id is not null;

alter table public.reglages_agent
  add column relance_apres_jours integer not null default 7 check (relance_apres_jours between 1 and 90);

-- ---------------------------------------------------------------------------
-- Logique commune (schéma privé) : toujours appelée avec l'utilisateur déjà
-- établi (auth.uid() côté site, empreinte de la clé côté connecteur).
-- ---------------------------------------------------------------------------

-- Contacts encore possibles aujourd'hui (jour de Paris).
create function prive.contacts_restants(p_user uuid) returns int
language sql stable security definer set search_path = '' as $$
  select greatest(
    coalesce((select r.limite_contacts_jour from public.reglages_agent r where r.user_id = p_user), 20)
    - (select count(*)::int from public.interactions_prospects i
        where i.user_id = p_user and i.sens = 'sortant'
          and i.created_at >= (date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris')),
    0)
$$;

-- Entreprises trouvées → prospects (sans doublon : même nom ou même fiche OSM).
create function prive.ajouter_prospects(p_user uuid, p_categorie text, p_ville text, p_liste jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ajoutes int;
  v_trouves int := jsonb_array_length(coalesce(p_liste, '[]'::jsonb));
begin
  with brut as (
    select distinct on (lower(btrim(x.nom))) x.*
      from jsonb_to_recordset(coalesce(p_liste, '[]'::jsonb))
           as x(nom text, email text, telephone text, site text, adresse text, osm_id text)
     where coalesce(btrim(x.nom), '') <> ''
     limit 200
  ), inseres as (
    insert into public.prospects (user_id, type, nom, entreprise, email, telephone, site, adresse, osm_id, categorie, source)
    select p_user, 'entreprise', left(b.nom, 200), left(b.nom, 200), left(b.email, 200), left(b.telephone, 50),
           left(b.site, 300), left(b.adresse, 300), left(b.osm_id, 50), left(p_categorie, 100),
           left('OpenStreetMap · ' || p_categorie || ' · ' || p_ville, 200)
      from brut b
     where not exists (
       select 1 from public.prospects p
        where p.user_id = p_user
          and (lower(p.nom) = lower(btrim(b.nom)) or (b.osm_id is not null and p.osm_id = b.osm_id))
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

-- Ce qu'il faut à l'IA pour rédiger : le prospect, la marque, le dernier
-- message envoyé (pour une relance). Refuse les prospects qu'on ne doit pas
-- (ou plus) démarcher.
create function prive.prospect_a_rediger(p_user uuid, p_id uuid, p_relance boolean) returns jsonb
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
    'telephone', p.telephone, 'site', p.site, 'statut', p.statut,
    'genre', case when coalesce(p_relance, false) or p.statut in ('contacte', 'relance') then 'relance' else 'premier' end,
    'dernier_contact_at', p.dernier_contact_at,
    'dernier_message', (select i.contenu from public.interactions_prospects i
                         where i.prospect_id = p.id and i.sens = 'sortant'
                         order by i.created_at desc limit 1),
    'contexte', prive.contexte_marque(p_user)
  );
end;
$$;

create function prive.enregistrer_brouillon_prospect(p_user uuid, p_id uuid, p_brouillon jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_statut text;
begin
  select statut into v_statut from public.prospects where id = p_id and user_id = p_user;
  if v_statut is null then raise exception 'prospect introuvable'; end if;
  if v_statut = 'ne_plus_contacter' then raise exception 'prospect oppose : ne plus contacter'; end if;
  update public.prospects
     set brouillon = jsonb_build_object(
           'genre', case when p_brouillon ->> 'genre' = 'relance' then 'relance' else 'premier' end,
           'canal', case when p_brouillon ->> 'canal' = 'email' then 'email' else 'message' end,
           'objet', left(coalesce(p_brouillon ->> 'objet', ''), 200),
           'texte', left(coalesce(p_brouillon ->> 'texte', ''), 4000),
           'redige_le', now())
   where id = p_id;
  return (select jsonb_build_object('id', p.id, 'nom', p.nom, 'statut', p.statut, 'brouillon', p.brouillon,
                                    'email', p.email, 'telephone', p.telephone)
            from public.prospects p where p.id = p_id);
end;
$$;

-- Changement de statut. « contacte » : l'utilisateur a envoyé le message
-- lui-même ; on l'archive (interactions_prospects, dont le déclencheur refuse
-- les contacts interdits) dans la limite du jour. Un prospect opposé ne peut
-- être rétabli que depuis le site (p_site).
create function prive.marquer_prospect(p_user uuid, p_id uuid, p_statut text, p_contenu text, p_site boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.prospects;
  v_statut text := p_statut;
begin
  select * into p from public.prospects where id = p_id and user_id = p_user;
  if p.id is null then raise exception 'prospect introuvable'; end if;
  if p_statut not in ('nouveau', 'contacte', 'relance', 'a_repondu', 'client', 'refus', 'ne_plus_contacter') then
    raise exception 'statut inconnu';
  end if;
  if p.statut = 'ne_plus_contacter' and p_statut <> 'ne_plus_contacter' and not p_site then
    raise exception 'prospect oppose : ne plus contacter';
  end if;

  if p_statut in ('contacte', 'relance') then
    if p.statut = 'ne_plus_contacter' then raise exception 'prospect oppose : ne plus contacter'; end if;
    if prive.contacts_restants(p_user) <= 0 then raise exception 'limite de contacts du jour atteinte'; end if;
    -- Deuxième contact ou plus : c'est une relance.
    if p.statut in ('contacte', 'relance') or p.brouillon ->> 'genre' = 'relance' then v_statut := 'relance'; end if;
    insert into public.interactions_prospects (prospect_id, user_id, canal, sens, contenu)
    values (p.id, p_user, coalesce(p.brouillon ->> 'canal', 'autre'), 'sortant',
            left(coalesce(nullif(btrim(p_contenu), ''), p.brouillon ->> 'texte', 'Contact effectué'), 4000));
    update public.prospects set statut = v_statut, dernier_contact_at = now(), brouillon = null where id = p.id;
  elsif p_statut = 'a_repondu' then
    insert into public.interactions_prospects (prospect_id, user_id, canal, sens, contenu)
    values (p.id, p_user, 'autre', 'entrant', left(coalesce(nullif(btrim(p_contenu), ''), 'A répondu'), 4000));
    update public.prospects set statut = v_statut, brouillon = null where id = p.id;
  else
    update public.prospects
       set statut = v_statut,
           brouillon = case when v_statut in ('client', 'refus', 'ne_plus_contacter') then null else brouillon end
     where id = p.id;
  end if;

  return (select jsonb_build_object('id', x.id, 'nom', x.nom, 'statut', x.statut, 'dernier_contact_at', x.dernier_contact_at,
                                    'contacts_restants_aujourdhui', prive.contacts_restants(p_user))
            from public.prospects x where x.id = p.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Accès depuis le site (utilisateur connecté).
-- ---------------------------------------------------------------------------
create function public.ajouter_prospects(p_categorie text, p_ville text, p_liste jsonb) returns jsonb
language sql security definer set search_path = '' as $$
  select prive.ajouter_prospects((select auth.uid()), p_categorie, p_ville, p_liste)
$$;
create function public.prospect_a_rediger(p_id uuid, p_relance boolean) returns jsonb
language sql security definer set search_path = '' as $$
  select prive.prospect_a_rediger((select auth.uid()), p_id, p_relance)
$$;
create function public.enregistrer_brouillon_prospect(p_id uuid, p_brouillon jsonb) returns jsonb
language sql security definer set search_path = '' as $$
  select prive.enregistrer_brouillon_prospect((select auth.uid()), p_id, p_brouillon)
$$;
create function public.marquer_prospect(p_id uuid, p_statut text, p_contenu text) returns jsonb
language sql security definer set search_path = '' as $$
  select prive.marquer_prospect((select auth.uid()), p_id, p_statut, p_contenu, true)
$$;
create function public.mes_contacts_restants() returns int
language sql stable security definer set search_path = '' as $$
  select prive.contacts_restants((select auth.uid()))
$$;

-- ---------------------------------------------------------------------------
-- Connecteur MCP : secret du moteur + empreinte de la clé (même modèle que
-- 20260930000100_connecteur_mcp.sql).
-- ---------------------------------------------------------------------------

-- Prospects, les plus récents d'abord. p_filtre : a_valider (message rédigé à
-- relire) ou a_relancer (contacté sans réponse depuis relance_apres_jours).
create function public.mcp_prospects(p_secret text, p_empreinte text, p_statut text, p_filtre text, p_limite int)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_jours int;
begin
  if not prive.secret_valide(p_secret) then raise exception 'secret invalide'; end if;
  v_user := prive.utilisateur_connecteur(p_empreinte);
  v_jours := coalesce((select r.relance_apres_jours from public.reglages_agent r where r.user_id = v_user), 7);
  return jsonb_build_object(
    'contacts_restants_aujourdhui', prive.contacts_restants(v_user),
    'relance_apres_jours', v_jours,
    'prospects', coalesce((
      select jsonb_agg(x order by x.cree_le desc)
        from (
          select p.id, p.nom, p.categorie as metier, coalesce(p.adresse, p.notes) as adresse, p.source,
                 p.email, p.telephone, p.site, p.statut, p.dernier_contact_at as dernier_contact,
                 p.brouillon as message_a_valider,
                 (p.statut in ('contacte', 'relance') and p.brouillon is null
                  and p.dernier_contact_at < now() - make_interval(days => v_jours)) as a_relancer,
                 p.created_at as cree_le
            from public.prospects p
           where p.user_id = v_user
             and (p_statut is null or p.statut = p_statut)
             and (p_filtre is null
                  or (p_filtre = 'a_valider' and p.brouillon is not null)
                  or (p_filtre = 'a_relancer' and p.statut in ('contacte', 'relance') and p.brouillon is null
                      and p.dernier_contact_at < now() - make_interval(days => v_jours)))
           order by p.created_at desc
           limit least(greatest(coalesce(p_limite, 20), 1), 100)
        ) x
    ), '[]'::jsonb)
  );
end;
$$;

create function public.mcp_ajouter_prospects(p_secret text, p_empreinte text, p_categorie text, p_ville text, p_liste jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then raise exception 'secret invalide'; end if;
  return prive.ajouter_prospects(prive.utilisateur_connecteur(p_empreinte), p_categorie, p_ville, p_liste);
end;
$$;

create function public.mcp_prospect_a_rediger(p_secret text, p_empreinte text, p_id uuid, p_relance boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then raise exception 'secret invalide'; end if;
  return prive.prospect_a_rediger(prive.utilisateur_connecteur(p_empreinte), p_id, p_relance);
end;
$$;

create function public.mcp_enregistrer_brouillon_prospect(p_secret text, p_empreinte text, p_id uuid, p_brouillon jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then raise exception 'secret invalide'; end if;
  return prive.enregistrer_brouillon_prospect(prive.utilisateur_connecteur(p_empreinte), p_id, p_brouillon);
end;
$$;

create function public.mcp_marquer_prospect(p_secret text, p_empreinte text, p_id uuid, p_statut text, p_contenu text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then raise exception 'secret invalide'; end if;
  return prive.marquer_prospect(prive.utilisateur_connecteur(p_empreinte), p_id, p_statut, p_contenu, false);
end;
$$;

-- Droits : le schéma privé n'est appelable par personne directement.
revoke all on function prive.contacts_restants(uuid) from public;
revoke all on function prive.ajouter_prospects(uuid, text, text, jsonb) from public;
revoke all on function prive.prospect_a_rediger(uuid, uuid, boolean) from public;
revoke all on function prive.enregistrer_brouillon_prospect(uuid, uuid, jsonb) from public;
revoke all on function prive.marquer_prospect(uuid, uuid, text, text, boolean) from public;

revoke all on function public.ajouter_prospects(text, text, jsonb) from public, anon;
revoke all on function public.prospect_a_rediger(uuid, boolean) from public, anon;
revoke all on function public.enregistrer_brouillon_prospect(uuid, jsonb) from public, anon;
revoke all on function public.marquer_prospect(uuid, text, text) from public, anon;
revoke all on function public.mes_contacts_restants() from public, anon;
grant execute on function public.ajouter_prospects(text, text, jsonb) to authenticated;
grant execute on function public.prospect_a_rediger(uuid, boolean) to authenticated;
grant execute on function public.enregistrer_brouillon_prospect(uuid, jsonb) to authenticated;
grant execute on function public.marquer_prospect(uuid, text, text) to authenticated;
grant execute on function public.mes_contacts_restants() to authenticated;

revoke all on function public.mcp_prospects(text, text, text, text, int) from public, authenticated;
revoke all on function public.mcp_ajouter_prospects(text, text, text, text, jsonb) from public, authenticated;
revoke all on function public.mcp_prospect_a_rediger(text, text, uuid, boolean) from public, authenticated;
revoke all on function public.mcp_enregistrer_brouillon_prospect(text, text, uuid, jsonb) from public, authenticated;
revoke all on function public.mcp_marquer_prospect(text, text, uuid, text, text) from public, authenticated;
grant execute on function public.mcp_prospects(text, text, text, text, int) to anon;
grant execute on function public.mcp_ajouter_prospects(text, text, text, text, jsonb) to anon;
grant execute on function public.mcp_prospect_a_rediger(text, text, uuid, boolean) to anon;
grant execute on function public.mcp_enregistrer_brouillon_prospect(text, text, uuid, jsonb) to anon;
grant execute on function public.mcp_marquer_prospect(text, text, uuid, text, text) to anon;
