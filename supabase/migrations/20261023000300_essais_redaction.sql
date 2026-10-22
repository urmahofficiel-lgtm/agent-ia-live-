-- Rédaction impossible (IA lente ou saturée) : un essai de plus au lieu
-- d'abandonner tout de suite. La file des rédactions reprend la tâche aux
-- passages suivants, jusqu'à 3 essais ; la vidéo et le carrousel, qui
-- attendent le texte, suivent.
create or replace function public.agent_echec_redaction(p_secret text, p_tache_id uuid, p_message text)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_essais integer;
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  update public.taches
     set resultat = coalesce(resultat, '{}'::jsonb)
       || jsonb_build_object('essais_brouillon', coalesce((resultat ->> 'essais_brouillon')::int, 0) + 1)
   where id = p_tache_id
  returning user_id, (resultat ->> 'essais_brouillon')::int into v_user, v_essais;
  if v_user is not null then
    insert into public.evenements_taches (tache_id, user_id, niveau, message)
    values (p_tache_id, v_user, 'erreur',
            p_message || case when v_essais < 3 then ' — nouvel essai au prochain passage.' else '' end);
  end if;
  return coalesce(v_essais, 0);
end;
$$;
revoke all on function public.agent_echec_redaction(text, uuid, text) from public, authenticated;
grant execute on function public.agent_echec_redaction(text, uuid, text) to anon;
