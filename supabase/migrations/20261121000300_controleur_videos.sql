-- Agent « Contrôleur vidéos » (demande de Younes du 21/11/2026) : toutes les
-- 20 minutes en journée, il relance les vidéos ratées (3 relances au plus par
-- publication), repère les vidéos coincées chez le robot de rendu et l'histoire
-- du jour manquante. La route /api/agent/controle-videos réveille le robot et
-- relance l'histoire si besoin. Rien n'est publié par lui.

create or replace function public.agent_controle_videos(p_secret text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_relancees int := 0;
  v_coincees int := 0;
  v_abandons int := 0;
  v_histoire boolean := false;
  r record;
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;

  -- 1. Vidéos à reprendre : échouées, ou coincées plus de 2 h chez le robot.
  for r in
    select t.id, t.user_id, t.titre, t.plateforme,
           coalesce((t.resultat ->> 'relances_controle')::int, 0) as relances,
           t.resultat ->> 'video_etat' as etat
      from public.taches t
      join public.reglages_agent g on g.user_id = t.user_id and g.agent_actif
     where t.type = 'publication'
       and t.plateforme in ('tiktok', 'instagram', 'facebook')
       and t.statut in ('a_valider', 'en_attente')
       and t.resultat ->> 'video_url' is null
       and coalesce(t.resultat ->> 'format', '') <> 'carrousel'
       and coalesce(t.planifiee_pour, t.created_at) > now() - interval '6 hours'
       and (
         t.resultat ->> 'video_etat' = 'echec'
         or (t.resultat ->> 'video_etat' = 'a_rendre' and (t.resultat ->> 'video_debut')::timestamptz < now() - interval '2 hours')
       )
     for update of t skip locked
  loop
    if r.relances >= 3 then
      if not coalesce((select (resultat ->> 'controle_abandon')::boolean from public.taches where id = r.id), false) then
        update public.taches set resultat = resultat || '{"controle_abandon": true}'::jsonb where id = r.id;
        insert into public.evenements_taches (tache_id, user_id, niveau, message)
        values (r.id, r.user_id, 'erreur', left(format('🛡️ Contrôleur vidéos : « %s » a échoué après 3 relances, je m''arrête (à regarder).', r.titre), 500));
        v_abandons := v_abandons + 1;
      end if;
      continue;
    end if;
    update public.taches
       set resultat = (resultat - 'video_etat' - 'video_erreur' - 'video_debut')
                      || jsonb_build_object('essais_video', 0, 'relances_controle', r.relances + 1)
     where id = r.id;
    insert into public.evenements_taches (tache_id, user_id, niveau, message)
    values (r.id, r.user_id, 'action',
            left(format('🛡️ Contrôleur vidéos : vidéo %s de « %s » relancée (%s/3).',
                        case when r.etat = 'echec' then 'ratée' else 'bloquée chez le robot' end, r.titre, r.relances + 1), 500));
    v_relancees := v_relancees + 1;
  end loop;

  -- 2. Vidéos en attente du robot depuis plus de 30 min : la route le réveille.
  select count(*) into v_coincees
    from public.taches t
   where t.type = 'publication'
     and t.resultat ->> 'video_etat' = 'a_rendre'
     and (t.resultat ->> 'video_debut')::timestamptz < now() - interval '30 minutes';

  -- 3. Histoire du jour manquante après 9 h (heure de Paris).
  if (now() at time zone 'Europe/Paris')::time > time '09:00' then
    select exists (
      select 1 from public.reglages_agent g
       where g.histoires_du_jour and g.agent_actif
         and not exists (select 1 from public.histoires h
                          where h.user_id = g.user_id and h.jour = (now() at time zone 'Europe/Paris')::date)
    ) into v_histoire;
  end if;

  return jsonb_build_object('relancees', v_relancees, 'coincees', v_coincees, 'abandons', v_abandons, 'histoire_manquante', v_histoire);
end;
$$;

revoke all on function public.agent_controle_videos(text) from public, authenticated;
grant execute on function public.agent_controle_videos(text) to anon;

select cron.schedule(
  'agent-controle-videos',
  '*/20 5-21 * * *',
  $$
  select net.http_post(
    url := 'https://agent-ia-live.vercel.app/api/agent/controle-videos',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-agent-secret', (select valeur from prive.secrets where nom = 'agent_tick')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
