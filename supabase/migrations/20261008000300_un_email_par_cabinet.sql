-- Un seul e-mail par cabinet : deux fiches avec la même adresse, ou le même
-- nom de domaine (hors messageries grand public), sont le même cabinet. Seule
-- la fiche déjà contactée (sinon la plus ancienne) reçoit e-mail et relance ;
-- aucune si le cabinet a répondu, refusé ou demandé à ne plus être contacté.

create or replace function prive.cle_email(p_email text) returns text
language sql immutable set search_path = '' as $$
  select case
           when a = '' or position('@' in a) = 0 then null
           when split_part(a, '@', 2) = any (array[
             'gmail.com', 'googlemail.com', 'orange.fr', 'wanadoo.fr', 'free.fr', 'sfr.fr', 'neuf.fr',
             'laposte.net', 'hotmail.com', 'hotmail.fr', 'hotmail.be', 'outlook.com', 'outlook.fr',
             'live.fr', 'live.com', 'yahoo.fr', 'yahoo.com', 'icloud.com', 'me.com', 'aol.com',
             'gmx.fr', 'gmx.com', 'skynet.be', 'telenet.be', 'proximus.be', 'scarlet.be', 'voo.be'])
             then a
           else split_part(a, '@', 2)
         end
    from (select lower(btrim(split_part(split_part(coalesce(p_email, ''), ';', 1), ',', 1))) as a) e
$$;

create or replace function prive.cabinet_deja_pris(p public.prospects) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.prospects q
     where q.user_id = p.user_id and q.id <> p.id
       and prive.cle_email(q.email) = prive.cle_email(p.email)
       and (q.statut in ('a_repondu', 'client', 'refus', 'ne_plus_contacter')
            or (q.statut <> 'nouveau' and p.statut = 'nouveau')
            or ((q.statut <> 'nouveau') = (p.statut <> 'nouveau')
                and (q.created_at, q.id) < (p.created_at, p.id))))
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
         and not prive.cabinet_deja_pris(p)
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
  if prive.cabinet_deja_pris(p) then
    raise exception 'cabinet deja contacte par une autre fiche (meme adresse ou meme domaine)';
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
