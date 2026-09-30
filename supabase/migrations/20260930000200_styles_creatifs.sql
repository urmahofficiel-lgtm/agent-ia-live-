-- Studio créatif : style par défaut des vidéos et des images de l'agent
-- (bouton « Créer une vidéo », « Nouvelle image », Reels et visuels auto).

alter table public.reglages_agent
  add column style_video text not null default 'classique'
    check (style_video in ('classique', 'ugc', 'avant_apres', 'etapes', 'top3')),
  add column style_image text not null default 'photo'
    check (style_image in ('photo', 'accroche', 'citation', 'promo'));

-- Le moteur lit les styles du propriétaire d'une tâche (null si aucun réglage).
create function public.agent_styles_defaut(p_secret text, p_tache_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  return (
    select jsonb_build_object('video', r.style_video, 'image', r.style_image)
      from public.taches t
      join public.reglages_agent r on r.user_id = t.user_id
     where t.id = p_tache_id
  );
end;
$$;
revoke all on function public.agent_styles_defaut(text, uuid) from public, authenticated;
grant execute on function public.agent_styles_defaut(text, uuid) to anon;
