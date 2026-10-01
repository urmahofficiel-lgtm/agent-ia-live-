-- Prospection : recherche automatique du téléphone (et de l'e-mail) des
-- prospects qui n'en ont pas, par le moteur (/api/agent/coordonnees, toutes
-- les 10 minutes). Une seule recherche par prospect ; la page où le numéro a
-- été trouvé est gardée (coordonnees_source).

alter table public.prospects
  add column coordonnees_cherchees_at timestamptz,
  add column coordonnees_source text;

create function public.agent_prospects_a_completer(p_secret text, p_limite int)
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
     order by p.created_at desc
     limit least(greatest(coalesce(p_limite, 6), 1), 20);
end;
$$;
revoke all on function public.agent_prospects_a_completer(text, int) from public, authenticated;
grant execute on function public.agent_prospects_a_completer(text, int) to anon;

-- Complète la fiche sans jamais écraser une coordonnée déjà renseignée.
create function public.agent_enregistrer_coordonnees(
  p_secret text, p_id uuid, p_telephone text, p_email text, p_site text, p_source text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_nom text;
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  update public.prospects
     set telephone = coalesce(telephone, left(nullif(btrim(p_telephone), ''), 50)),
         email = coalesce(email, left(nullif(btrim(p_email), ''), 200)),
         site = coalesce(site, left(nullif(btrim(p_site), ''), 300)),
         coordonnees_cherchees_at = now(),
         coordonnees_source = left(nullif(btrim(p_source), ''), 500)
   where id = p_id
  returning user_id, nom into v_user, v_nom;
  if v_user is not null and nullif(btrim(p_telephone), '') is not null then
    insert into public.evenements_taches (user_id, niveau, message)
    values (v_user, 'info', format('📞 Prospection : téléphone trouvé pour « %s ».', v_nom));
  end if;
end;
$$;
revoke all on function public.agent_enregistrer_coordonnees(text, uuid, text, text, text, text) from public, authenticated;
grant execute on function public.agent_enregistrer_coordonnees(text, uuid, text, text, text, text) to anon;

select cron.schedule(
  'agent-coordonnees',
  '3-59/10 * * * *',
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
