-- Publications restées « en cours » : le passage du moteur a été coupé en route
-- (délai d'exécution Vercel dépassé pendant l'image, IA bloquée…). Sans reprise,
-- elles restaient bloquées pour toujours. Après 20 min sans nouvelle, elles
-- repartent en file une fois (si leur heure n'est pas passée de plus de 3 h),
-- sinon elles passent en échec avec un message clair.
create or replace function public.agent_reprendre_bloquees(p_secret text)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  with b as (
    update public.taches t
       set statut = case
             when coalesce((t.resultat ->> 'reprises')::int, 0) >= 1
               or t.planifiee_pour < now() - interval '3 hours' then 'echouee'
             else 'en_attente'
           end,
           resultat = coalesce(t.resultat, '{}'::jsonb)
             || jsonb_build_object('reprises', coalesce((t.resultat ->> 'reprises')::int, 0) + 1)
     where t.type = 'publication'
       and t.statut = 'en_cours'
       and t.updated_at < now() - interval '20 minutes'
    returning t.id, t.user_id, t.titre, t.statut
  )
  insert into public.evenements_taches (tache_id, user_id, niveau, message)
  select id, user_id,
         case when statut = 'echouee' then 'erreur' else 'info' end,
         case when statut = 'echouee'
           then '⛔ « ' || titre || ' » est restée bloquée en cours de publication : mise en échec. Reprogrammez-la si besoin.'
           else '🔁 « ' || titre || ' » était restée bloquée en cours de publication : nouvel essai au prochain passage.'
         end
    from b;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.agent_reprendre_bloquees(text) from public, authenticated;
grant execute on function public.agent_reprendre_bloquees(text) to anon;
