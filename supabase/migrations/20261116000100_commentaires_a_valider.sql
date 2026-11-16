-- Commentaires « à valider » (accord de Younes du 16/11/2026, après une réponse
-- LinkedIn qui prêtait au logiciel une capacité qu'il n'a pas) : une question
-- précise sur le produit n'est plus répondue seule. Le commentaire est noté
-- « a_valider » (jamais retraité) et la réponse proposée part au journal de
-- l'agent, pour que l'utilisateur la relise et la poste lui-même.

alter table public.commentaires_traites drop constraint if exists commentaires_traites_action_check;
alter table public.commentaires_traites add constraint commentaires_traites_action_check
  check (action in ('repondre', 'liker', 'ignorer', 'echec', 'a_valider'));

create or replace function public.agent_commentaire_traite(
  p_secret text, p_user uuid, p_commentaire text, p_plateforme text,
  p_action text, p_auteur text, p_texte text, p_reponse text)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  insert into public.commentaires_traites (user_id, commentaire_id, plateforme, action, auteur, commentaire, reponse)
  values (p_user, p_commentaire, p_plateforme, p_action, left(p_auteur, 200), left(p_texte, 2000), left(p_reponse, 1000))
  on conflict do nothing;
  get diagnostics n = row_count;
  if n > 0 and p_action in ('repondre', 'liker') then
    insert into public.evenements_taches (user_id, niveau, message)
    values (p_user, 'info', case p_action
      when 'repondre' then format('Commentaire de %s (%s) : réponse envoyée « %s ».', coalesce(p_auteur, 'quelqu''un'), p_plateforme, left(p_reponse, 200))
      else format('Commentaire de %s (%s) : liké.', coalesce(p_auteur, 'quelqu''un'), p_plateforme) end);
  elsif n > 0 and p_action = 'a_valider' then
    insert into public.evenements_taches (user_id, niveau, message)
    values (p_user, 'action', format(
      'Question de %s (%s) à laquelle répondre vous-même : « %s ». Réponse proposée : « %s ».',
      coalesce(p_auteur, 'quelqu''un'), p_plateforme, left(p_texte, 400),
      coalesce(nullif(left(p_reponse, 400), ''), 'aucune, à rédiger')));
  end if;
  return n > 0;
end;
$$;

revoke all on function public.agent_commentaire_traite(text, uuid, text, text, text, text, text, text) from public, authenticated;
grant execute on function public.agent_commentaire_traite(text, uuid, text, text, text, text, text, text) to anon;
