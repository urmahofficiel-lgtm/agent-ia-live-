-- Coordonnées des prospects : recherche web via Tavily (offre gratuite,
-- 1 000 recherches par mois). Prospects ayant déjà un site d'abord (lecture du
-- site, sans recherche). Toutes les heures de 7 h à 20 h, 2 prospects par
-- passage : environ 850 recherches par mois au plus.

create or replace function public.agent_prospects_a_completer(p_secret text, p_limite int)
returns table (id uuid, user_id uuid, nom text, adresse text, site text, siret text, categorie text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  return query
    select p.id, p.user_id, p.nom, p.adresse, p.site, p.siret, p.categorie
      from public.prospects p
     where p.type = 'entreprise'
       and p.telephone is null
       and p.coordonnees_cherchees_at is null
       and p.statut not in ('ne_plus_contacter', 'refus', 'client')
     order by (p.site is null), p.created_at desc
     limit least(greatest(coalesce(p_limite, 2), 1), 20);
end;
$$;

select cron.schedule(
  'agent-coordonnees',
  '23 5-18 * * *',
  $$
  select net.http_post(
    url := 'https://agent-ia-live.vercel.app/api/agent/coordonnees',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-agent-secret', (select valeur from prive.secrets where nom = 'agent_tick')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 250000
  );
  $$
);
