-- LinkedIn profil personnel en direct. Si un autre compte LinkedIn publie
-- déjà (page entreprise via Zernio), le profil s'ajoute sans le remplacer :
-- l'utilisateur choisit ensuite lequel publie.
alter table public.comptes_connectes drop constraint comptes_connectes_fournisseur_check;
alter table public.comptes_connectes
  add constraint comptes_connectes_fournisseur_check
  check (fournisseur in ('zernio', 'meta', 'instagram', 'bluesky', 'telegram', 'linkedin'));

create or replace function public.compte_direct_enregistrer(
  p_secret text, p_user uuid, p_fournisseur text, p_plateforme text, p_externe text, p_nom text, p_jeton text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_statut text;
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  if p_fournisseur not in ('bluesky', 'telegram', 'linkedin') then
    raise exception 'fournisseur non pris en charge';
  end if;
  delete from public.comptes_connectes where user_id = p_user and fournisseur = p_fournisseur and plateforme = p_plateforme;
  v_statut := case when exists (
    select 1 from public.comptes_connectes
     where user_id = p_user and plateforme = p_plateforme and statut = 'connecte'
  ) then 'desactive' else 'connecte' end;
  insert into public.comptes_connectes (user_id, plateforme, libelle, statut, fournisseur, compte_externe_id, nom_utilisateur)
  values (p_user, p_plateforme, p_fournisseur || ':' || p_externe, v_statut, p_fournisseur, p_externe, p_nom)
  returning id into v_id;
  insert into prive.jetons_meta (compte_id, jeton) values (v_id, p_jeton);
end;
$$;
