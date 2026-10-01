-- Agent e-mail de prospection : rédige et ENVOIE les e-mails (Resend), avec
-- validation par l'utilisateur au choix. Garde-fous : limite par jour (montée
-- en charge progressive), lien de désinscription en 1 clic (RFC 8058),
-- adresses en erreur écartées, plainte pour spam = ne plus contacter, une
-- seule relance. Prospection B2B uniquement (entreprises).

alter table public.reglages_agent
  add column email_auto boolean not null default false,          -- l'agent rédige seul les e-mails
  add column email_validation boolean not null default true,     -- l'utilisateur valide chaque e-mail avant l'envoi
  add column email_par_jour integer not null default 10 check (email_par_jour between 1 and 100),
  add column email_expediteur text,                              -- ex. prospection@btp-ecosystem.com (domaine vérifié)
  add column email_reponse text;                                 -- adresse qui reçoit les réponses

alter table public.prospects
  add column jeton_desinscription uuid not null default gen_random_uuid(),
  add column email_invalide boolean not null default false,
  add column dernier_email_id text;

create unique index prospects_jeton_desinscription_idx on public.prospects (jeton_desinscription);
create index prospects_dernier_email_idx on public.prospects (dernier_email_id) where dernier_email_id is not null;

-- E-mails envoyés aujourd'hui (jour de Paris).
create function prive.emails_envoyes_aujourdhui(p_user uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.interactions_prospects i
   where i.user_id = p_user and i.sens = 'sortant' and i.canal = 'email'
     and i.created_at >= (date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris')
$$;

-- ---------------------------------------------------------------------------
-- Moteur (secret) : prospects à traiter, contexte d'envoi, envoi enregistré.
-- ---------------------------------------------------------------------------

-- Prospects à qui écrire maintenant : premiers contacts et relances (une
-- seule), dans la limite du jour. En mode validation, pas plus de brouillons
-- en attente que la limite du jour.
create function public.agent_emails_a_traiter(p_secret text)
returns table (prospect_id uuid, user_id uuid, relance boolean, validation boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  return query
    with u as (
      select r.user_id, r.email_validation, r.relance_apres_jours,
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
         and p.brouillon is null
         and (p.statut = 'nouveau'
              or (p.statut = 'contacte' and p.dernier_contact_at <= now() - make_interval(days => u.relance_apres_jours)))
    )
    select c.id, c.user_id, c.relance, c.email_validation from candidats c where c.rang <= c.quota;
end;
$$;

-- Ce qu'il faut pour rédiger (réutilise les garde-fous de prospect_a_rediger).
create function public.agent_prospect_a_rediger(p_secret text, p_user uuid, p_id uuid, p_relance boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then raise exception 'secret invalide'; end if;
  return prive.prospect_a_rediger(p_user, p_id, p_relance);
end;
$$;

create function public.agent_enregistrer_brouillon_prospect(p_secret text, p_user uuid, p_id uuid, p_brouillon jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then raise exception 'secret invalide'; end if;
  return prive.enregistrer_brouillon_prospect(p_user, p_id, p_brouillon);
end;
$$;

-- Tout ce qu'il faut pour envoyer le brouillon e-mail d'un prospect. Refuse
-- les envois interdits (opposition, client, refus, adresse en erreur,
-- particulier, limite du jour).
create function public.agent_email_a_envoyer(p_secret text, p_user uuid, p_id uuid) returns jsonb
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
    'site', (select nullif(pm.site, '') from public.profil_marque pm where pm.user_id = p_user)
  );
end;
$$;

-- E-mail parti : le prospect passe « contacté » (ou « relancé »), l'échange
-- est enregistré, et l'identifiant Resend gardé (rebonds, plaintes).
create function public.agent_email_envoye(p_secret text, p_user uuid, p_id uuid, p_contenu text, p_email_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v jsonb;
begin
  if not prive.secret_valide(p_secret) then raise exception 'secret invalide'; end if;
  v := prive.marquer_prospect(p_user, p_id, 'contacte', p_contenu, false);
  update public.prospects set dernier_email_id = left(p_email_id, 100) where id = p_id and user_id = p_user;
  insert into public.evenements_taches (user_id, niveau, message)
  select p_user, 'action', format('✉️ E-mail de prospection envoyé à « %s ».', p.nom)
    from public.prospects p where p.id = p_id;
  return v;
end;
$$;

-- Événements Resend : adresse en erreur → plus d'envoi ; plainte pour spam →
-- ne plus contacter.
create function public.agent_email_evenement(p_secret text, p_email_id text, p_type text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.prospects;
begin
  if not prive.secret_valide(p_secret) then raise exception 'secret invalide'; end if;
  select * into p from public.prospects where dernier_email_id = p_email_id;
  if p.id is null then return; end if;
  if p_type = 'email.bounced' then
    update public.prospects set email_invalide = true where id = p.id;
    insert into public.evenements_taches (user_id, niveau, message)
    values (p.user_id, 'erreur', format('📭 E-mail non distribué à « %s » : adresse invalide, plus d''envoi à cette adresse.', p.nom));
  elsif p_type = 'email.complained' then
    update public.prospects set statut = 'ne_plus_contacter', brouillon = null where id = p.id;
    insert into public.interactions_prospects (prospect_id, user_id, canal, sens, contenu)
    values (p.id, p.user_id, 'email', 'entrant', 'Signalé comme indésirable : ne plus contacter');
  end if;
end;
$$;

revoke all on function public.agent_emails_a_traiter(text) from public, authenticated;
revoke all on function public.agent_prospect_a_rediger(text, uuid, uuid, boolean) from public, authenticated;
revoke all on function public.agent_enregistrer_brouillon_prospect(text, uuid, uuid, jsonb) from public, authenticated;
revoke all on function public.agent_email_a_envoyer(text, uuid, uuid) from public, authenticated;
revoke all on function public.agent_email_envoye(text, uuid, uuid, text, text) from public, authenticated;
revoke all on function public.agent_email_evenement(text, text, text) from public, authenticated;
grant execute on function public.agent_emails_a_traiter(text) to anon;
grant execute on function public.agent_prospect_a_rediger(text, uuid, uuid, boolean) to anon;
grant execute on function public.agent_enregistrer_brouillon_prospect(text, uuid, uuid, jsonb) to anon;
grant execute on function public.agent_email_a_envoyer(text, uuid, uuid) to anon;
grant execute on function public.agent_email_envoye(text, uuid, uuid, text, text) to anon;
grant execute on function public.agent_email_evenement(text, text, text) to anon;

-- ---------------------------------------------------------------------------
-- Désinscription en 1 clic (lien dans chaque e-mail, sans compte).
-- ---------------------------------------------------------------------------
create function public.desinscrire_prospect(p_jeton uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  p public.prospects;
begin
  select * into p from public.prospects where jeton_desinscription = p_jeton;
  if p.id is null then return null; end if;
  if p.statut <> 'ne_plus_contacter' then
    update public.prospects set statut = 'ne_plus_contacter', brouillon = null where id = p.id;
    insert into public.interactions_prospects (prospect_id, user_id, canal, sens, contenu)
    values (p.id, p.user_id, 'email', 'entrant', 'Désinscription par le lien de l''e-mail : ne plus contacter');
    insert into public.evenements_taches (user_id, niveau, message)
    values (p.user_id, 'info', format('🚫 « %s » s''est désinscrit : plus aucun message ne lui sera envoyé.', p.nom));
  end if;
  return coalesce((select nullif(pm.nom, '') from public.profil_marque pm where pm.user_id = p.user_id), 'cet expéditeur');
end;
$$;
revoke all on function public.desinscrire_prospect(uuid) from public;
grant execute on function public.desinscrire_prospect(uuid) to anon, authenticated;

select cron.schedule(
  'agent-emails',
  '*/15 6-16 * * 1-5',
  $$
  select net.http_post(
    url := 'https://agent-ia-live.vercel.app/api/agent/emails',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-agent-secret', (select valeur from prive.secrets where nom = 'agent_tick')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 250000
  );
  $$
);
