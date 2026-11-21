-- Threads en direct (accord de Younes du 21/11/2026) : compte Threads connecté
-- par l'API Threads de Meta (gratuite), sans place chez Zernio.

alter table public.comptes_connectes drop constraint if exists comptes_connectes_fournisseur_check;
alter table public.comptes_connectes add constraint comptes_connectes_fournisseur_check
  check (fournisseur = any (array['zernio', 'meta', 'instagram', 'bluesky', 'telegram', 'linkedin', 'youtube', 'threads']));

create or replace function public.compte_direct_enregistrer(p_secret text, p_user uuid, p_fournisseur text, p_plateforme text, p_externe text, p_nom text, p_jeton text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_id uuid;
  v_statut text;
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  if p_fournisseur not in ('bluesky', 'telegram', 'linkedin', 'youtube', 'threads') then
    raise exception 'fournisseur non pris en charge';
  end if;
  -- Reconnexion : la ligne existante est mise à jour (même compte, nouveau jeton).
  select c.id into v_id from public.comptes_connectes c
   where c.user_id = p_user and c.fournisseur = p_fournisseur and c.plateforme = p_plateforme
   order by c.created_at desc limit 1;
  if v_id is not null then
    update public.comptes_connectes
       set libelle = p_fournisseur || ':' || p_externe, compte_externe_id = p_externe, nom_utilisateur = p_nom
     where id = v_id;
    update prive.jetons_meta set jeton = p_jeton where compte_id = v_id;
    if not found then
      insert into prive.jetons_meta (compte_id, jeton) values (v_id, p_jeton);
    end if;
    return;
  end if;
  v_statut := case when exists (
    select 1 from public.comptes_connectes
     where user_id = p_user and plateforme = p_plateforme and statut = 'connecte'
  ) then 'desactive' else 'connecte' end;
  insert into public.comptes_connectes (user_id, plateforme, libelle, statut, fournisseur, compte_externe_id, nom_utilisateur)
  values (p_user, p_plateforme, p_fournisseur || ':' || p_externe, v_statut, p_fournisseur, p_externe, p_nom)
  returning id into v_id;
  insert into prive.jetons_meta (compte_id, jeton) values (v_id, p_jeton);
end;
$function$;

-- Un post Threads par jour pour commencer.
update public.reglages_agent set rythme = coalesce(rythme, '{}'::jsonb) || '{"threads": 1}'::jsonb
 where user_id = '1d464cc0-fb73-4412-895c-cb5ef69f3c3f';
