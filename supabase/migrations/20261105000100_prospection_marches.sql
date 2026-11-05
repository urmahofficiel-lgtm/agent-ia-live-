-- Prospection « marchés publics » (accord de Younes du 05/11/2026) : chaque
-- jour, les entreprises du BTP qui viennent de remporter un marché de travaux
-- (avis d'attribution du BOAMP) sont ajoutées aux prospects ; la recherche de
-- coordonnées et l'agent e-mail font le reste.

alter table public.reglages_agent
  add column if not exists prospection_marches boolean not null default false;

create or replace function public.agent_comptes_marches(p_secret text)
returns table (user_id uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  return query select r.user_id from public.reglages_agent r where r.prospection_marches and r.agent_actif;
end;
$$;

-- Ajoute les entreprises (sans doublon : SIRET ou nom) ; 20 au plus par appel.
create or replace function public.agent_ajouter_prospects_marches(p_secret text, p_user uuid, p_liste jsonb)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_ajoutes int;
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  with brut as (
    select distinct on (lower(btrim(x.nom))) x.*
      from jsonb_to_recordset(coalesce(p_liste, '[]'::jsonb)) as x(nom text, adresse text, siret text, infos text, departement text)
     where coalesce(btrim(x.nom), '') <> ''
     limit 20
  ), inseres as (
    insert into public.prospects (user_id, type, nom, entreprise, adresse, siret, infos, categorie, source)
    select p_user, 'entreprise', left(b.nom, 200), left(b.nom, 200), left(b.adresse, 300),
           case when b.siret ~ '^\d{14}$' then b.siret end, left(b.infos, 300),
           'Entreprises de travaux (marchés publics)', left('BOAMP · marché public · ' || coalesce(b.departement, ''), 200)
      from brut b
     where not exists (
       select 1 from public.prospects p
        where p.user_id = p_user
          and (lower(p.nom) = lower(btrim(b.nom)) or (b.siret ~ '^\d{14}$' and p.siret = b.siret))
     )
    on conflict do nothing
    returning 1
  )
  select count(*) into v_ajoutes from inseres;
  if v_ajoutes > 0 then
    insert into public.evenements_taches (user_id, niveau, message)
    values (p_user, 'info', format('Prospection marchés publics : %s entreprise(s) du BTP qui viennent de remporter un marché ajoutée(s) au CRM.', v_ajoutes));
  end if;
  return v_ajoutes;
end;
$$;

revoke all on function public.agent_comptes_marches(text) from public, authenticated;
revoke all on function public.agent_ajouter_prospects_marches(text, uuid, jsonb) from public, authenticated;
grant execute on function public.agent_comptes_marches(text) to anon;
grant execute on function public.agent_ajouter_prospects_marches(text, uuid, jsonb) to anon;

select cron.schedule(
  'agent-marches',
  '17 6 * * *',
  $$
  select net.http_post(
    url := 'https://agent-ia-live.vercel.app/api/agent/marches',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-agent-secret', (select valeur from prive.secrets where nom = 'agent_tick')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 250000
  );
  $$
);
