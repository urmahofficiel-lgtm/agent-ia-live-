-- Connexions directes sans validation : Bluesky (mot de passe d'application)
-- et Telegram (bot). Les identifiants restent dans le schéma privé.
alter table public.comptes_connectes drop constraint comptes_connectes_fournisseur_check;
alter table public.comptes_connectes
  add constraint comptes_connectes_fournisseur_check
  check (fournisseur in ('zernio', 'meta', 'instagram', 'bluesky', 'telegram'));

create function public.compte_direct_enregistrer(
  p_secret text, p_user uuid, p_fournisseur text, p_plateforme text, p_externe text, p_nom text, p_jeton text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  if p_fournisseur not in ('bluesky', 'telegram') then
    raise exception 'fournisseur non pris en charge';
  end if;
  delete from public.comptes_connectes where user_id = p_user and fournisseur = p_fournisseur and plateforme = p_plateforme;
  insert into public.comptes_connectes (user_id, plateforme, libelle, statut, fournisseur, compte_externe_id, nom_utilisateur)
  values (p_user, p_plateforme, p_fournisseur || ':' || p_externe, 'connecte', p_fournisseur, p_externe, p_nom)
  returning id into v_id;
  insert into prive.jetons_meta (compte_id, jeton) values (v_id, p_jeton);
end;
$$;
revoke all on function public.compte_direct_enregistrer(text, uuid, text, text, text, text, text) from public, authenticated;
grant execute on function public.compte_direct_enregistrer(text, uuid, text, text, text, text, text) to anon;
