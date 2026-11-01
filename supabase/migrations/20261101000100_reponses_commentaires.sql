-- Réponses automatiques aux commentaires (accord de Younes du 01/11/2026) :
-- l'agent lit les nouveaux commentaires (comptes reliés par Zernio : TikTok,
-- LinkedIn…), like et/ou répond seul. Chaque commentaire traité est noté pour
-- ne jamais y revenir.

alter table public.reglages_agent
  add column if not exists reponses_auto boolean not null default false;

create table if not exists public.commentaires_traites (
  user_id uuid not null references auth.users (id) on delete cascade,
  commentaire_id text not null,
  plateforme text not null,
  action text not null check (action in ('repondre', 'liker', 'ignorer', 'echec')),
  auteur text,
  commentaire text,
  reponse text,
  created_at timestamptz not null default now(),
  primary key (user_id, commentaire_id)
);
alter table public.commentaires_traites enable row level security;
create policy "commentaires_traites : lecture par le propriétaire" on public.commentaires_traites
  for select to authenticated using (user_id = auth.uid());

-- Comptes dont l'agent répond seul, avec la fiche de la marque.
create or replace function public.agent_reponses_auto(p_secret text)
returns table (user_id uuid, profil text, contexte text, deja text[])
language plpgsql stable security definer set search_path = '' as $$
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  return query
    select r.user_id, r.zernio_profile_id, prive.contexte_marque(r.user_id),
           coalesce((select array_agg(c.commentaire_id) from public.commentaires_traites c
                      where c.user_id = r.user_id and c.created_at > now() - interval '60 days'), '{}')
      from public.reglages_agent r
     where r.reponses_auto and r.zernio_profile_id is not null;
end;
$$;

-- Note un commentaire traité (faux s'il l'était déjà) et l'écrit au journal.
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
  end if;
  return n > 0;
end;
$$;

revoke all on function public.agent_reponses_auto(text) from public, authenticated;
revoke all on function public.agent_commentaire_traite(text, uuid, text, text, text, text, text, text) from public, authenticated;
grant execute on function public.agent_reponses_auto(text) to anon;
grant execute on function public.agent_commentaire_traite(text, uuid, text, text, text, text, text, text) to anon;

-- Toutes les 20 minutes, de 6 h à 22 h (heure de Paris environ).
select cron.schedule(
  'agent-commentaires',
  '7,27,47 5-21 * * *',
  $$
  select net.http_post(
    url := 'https://agent-ia-live.vercel.app/api/agent/commentaires',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-agent-secret', (select valeur from prive.secrets where nom = 'agent_tick')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 250000
  );
  $$
);

update public.reglages_agent set reponses_auto = true
 where user_id = '1d464cc0-fb73-4412-895c-cb5ef69f3c3f';
