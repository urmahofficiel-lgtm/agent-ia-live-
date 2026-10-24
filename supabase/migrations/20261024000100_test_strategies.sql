-- Test de stratégies sur 14 jours : le rythme habituel (sans plafond), un
-- jour en mode croissance, le lendemain comme avant (« classique »), pour
-- comparer les résultats à volume égal. Chaque réseau voit ainsi chaque jour
-- de la semaine une fois dans chaque stratégie.

alter table public.reglages_agent
  add column if not exists test_strategies_depuis date,
  add column if not exists test_strategies_jusqu date;

-- Stratégie du jour pendant le test : 'croissance' ou 'classique' ; null hors test.
create or replace function public.agent_test_strategies(p_secret text, p_user uuid, p_jour date)
returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  r record;
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  select test_strategies_depuis as depuis, test_strategies_jusqu as jusqu into r
    from public.reglages_agent where user_id = p_user;
  if r.depuis is null or r.jusqu is null or p_jour < r.depuis or p_jour > r.jusqu then
    return null;
  end if;
  return case when (p_jour - r.depuis) % 2 = 0 then 'croissance' else 'classique' end;
end;
$$;
revoke all on function public.agent_test_strategies(text, uuid, date) from public, authenticated;
grant execute on function public.agent_test_strategies(text, uuid, date) to anon;
