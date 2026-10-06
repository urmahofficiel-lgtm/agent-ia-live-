-- Campagne e-mail ciblée : l'agent peut n'écrire qu'à un métier (ex.
-- « Architectes ») et joindre un document (PDF de présentation) à chaque
-- e-mail. La recherche de coordonnées passe d'abord par ce métier.

alter table public.reglages_agent
  add column email_cible text check (char_length(email_cible) <= 80),            -- métier visé (vide = tous)
  add column email_piece_jointe_url text check (email_piece_jointe_url ~ '^https://'),
  add column email_piece_jointe_nom text check (char_length(email_piece_jointe_nom) <= 120);

-- Prospects à qui écrire maintenant : premiers contacts et relances (une
-- seule), dans la limite du jour, limités au métier visé s'il y en a un. En
-- envoi direct, un ancien brouillon e-mail en attente est réécrit et envoyé.
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
         and (p.brouillon is null or (not u.email_validation and p.brouillon ->> 'canal' = 'email'))
         and (p.statut = 'nouveau'
              or (p.statut = 'contacte' and p.dernier_contact_at <= now() - make_interval(days => u.relance_apres_jours)))
    )
    select c.id, c.user_id, c.relance, c.email_validation from candidats c where c.rang <= c.quota;
end;
$$;

-- Tout ce qu'il faut pour envoyer le brouillon e-mail d'un prospect (avec le
-- document joint choisi). Refuse les envois interdits (opposition, client,
-- refus, adresse en erreur, particulier, limite du jour).
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

-- Coordonnées à chercher : le métier visé par l'agent e-mail d'abord, et pour
-- lui on cherche aussi l'e-mail quand le téléphone est déjà connu.
create or replace function public.agent_prospects_a_completer(p_secret text, p_limite int)
returns table (id uuid, user_id uuid, nom text, adresse text, site text, siret text, categorie text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  return query
    with c as (
      select p.*,
             coalesce(btrim(r.email_cible) <> ''
               and p.categorie ilike '%' || btrim(r.email_cible) || '%', false) as vise
        from public.prospects p
        left join public.reglages_agent r on r.user_id = p.user_id
    )
    select c.id, c.user_id, c.nom, c.adresse, c.site, c.siret, c.categorie
      from c
     where c.type = 'entreprise'
       and c.coordonnees_cherchees_at is null
       and (c.telephone is null or (c.vise and c.email is null))
       and c.statut not in ('ne_plus_contacter', 'refus', 'client')
     order by c.vise desc, (c.site is null), c.created_at desc
     limit least(greatest(coalesce(p_limite, 2), 1), 20);
end;
$$;

-- Documents joints aux e-mails (PDF) : publics (le service d'envoi les
-- télécharge), chacun n'écrit que dans son propre dossier.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', true, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create policy "documents : ajout dans son dossier" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "documents : suppression dans son dossier" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
