-- Un même sujet publié dans une autre langue n'est pas un doublon (posts en
-- langue étrangère du jour, demande de Younes du 21/11/2026) : le contrôle
-- qualité compare aussi le marché.
create or replace function public.agent_publications_recentes_marche(p_secret text, p_user uuid)
returns table (plateforme text, titre text, marche text, publiee_le timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  return query
    select t.plateforme, t.titre, prive.marche_valide(t.marche), coalesce((t.resultat ->> 'publie_le')::timestamptz, t.updated_at)
      from public.taches t
     where t.user_id = p_user
       and t.type = 'publication'
       and t.statut = 'terminee'
       and t.updated_at > now() - interval '4 days';
end;
$$;
revoke all on function public.agent_publications_recentes_marche(text, uuid) from public, authenticated;
grant execute on function public.agent_publications_recentes_marche(text, uuid) to anon;
