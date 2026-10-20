-- Veille des tendances du domaine de la marque (une par jour et par compte) :
-- sujets d'actualité, mots de la cible et hashtags réellement employés. Le
-- dernier résumé (3 jours au plus) rejoint la fiche lue par l'agent, et ses
-- hashtags remplacent la liste figée de l'analyse de marché.
create table public.tendances (
  user_id uuid not null references auth.users (id) on delete cascade,
  jour date not null,
  resume text not null check (length(resume) <= 6000),
  hashtags text[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (user_id, jour)
);
alter table public.tendances enable row level security;
create policy "tendances : les siennes" on public.tendances
  for select to authenticated using (user_id = (select auth.uid()));

-- Moteur : tendances du jour (null si pas encore cherchées).
create or replace function public.agent_tendances_du_jour(p_secret text, p_user uuid, p_jour date)
returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  return (select t.resume from public.tendances t where t.user_id = p_user and t.jour = p_jour);
end;
$$;
revoke all on function public.agent_tendances_du_jour(text, uuid, date) from public, authenticated;
grant execute on function public.agent_tendances_du_jour(text, uuid, date) to anon;

create or replace function public.agent_enregistrer_tendances(p_secret text, p_user uuid, p_jour date, p_resume text, p_hashtags text[])
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  insert into public.tendances (user_id, jour, resume, hashtags)
  values (p_user, p_jour, left(p_resume, 6000), coalesce(p_hashtags[1:10], '{}'))
  on conflict (user_id, jour) do update set resume = excluded.resume, hashtags = excluded.hashtags, created_at = now();
end;
$$;
revoke all on function public.agent_enregistrer_tendances(text, uuid, date, text, text[]) from public, authenticated;
grant execute on function public.agent_enregistrer_tendances(text, uuid, date, text, text[]) to anon;

-- Fiche de la marque : tendances de la semaine ajoutées, hashtags de la veille
-- à la place de la liste figée (qui reste en secours).
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
