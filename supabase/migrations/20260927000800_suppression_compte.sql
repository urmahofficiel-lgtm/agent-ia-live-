-- Suppression du compte par l'utilisateur lui-même (droit à l'effacement,
-- exigé aussi par Meta). Toutes les tables pointent vers auth.users avec
-- « on delete cascade » : effacer l'utilisateur efface tout le reste, y
-- compris les jetons d'accès (prive.jetons_meta suit comptes_connectes).
create function public.supprimer_mon_compte()
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'non connecté';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;
revoke all on function public.supprimer_mon_compte() from public, anon;
grant execute on function public.supprimer_mon_compte() to authenticated;
