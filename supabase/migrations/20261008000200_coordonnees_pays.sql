-- Coordonnées des prospects : le pays du prospect est transmis à la
-- recherche (numéros belges au format +32, recherche web en Belgique).
-- Même sélection que agent_prospects_a_completer (20261006000100), avec le
-- pays en plus ; le moteur appelle désormais celle-ci.

create or replace function public.agent_coordonnees_a_chercher(p_secret text, p_limite int)
returns table (id uuid, user_id uuid, nom text, adresse text, site text, siret text, categorie text, pays text)
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
    select c.id, c.user_id, c.nom, c.adresse, c.site, c.siret, c.categorie, c.pays
      from c
     where c.type = 'entreprise'
       and c.coordonnees_cherchees_at is null
       and (c.telephone is null or (c.vise and c.email is null))
       and c.statut not in ('ne_plus_contacter', 'refus', 'client')
     order by c.vise desc, (c.site is null), c.created_at desc
     limit least(greatest(coalesce(p_limite, 2), 1), 20);
end;
$$;
revoke all on function public.agent_coordonnees_a_chercher(text, int) from public, authenticated;
grant execute on function public.agent_coordonnees_a_chercher(text, int) to anon;
