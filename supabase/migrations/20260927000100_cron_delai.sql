-- Le moteur crée désormais des images : on lui laisse jusqu'à 290 s.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'agent-tick'),
  command := $$
  select net.http_post(
    url := 'https://agent-ia-live.vercel.app/api/agent/tick',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-agent-secret', (select valeur from prive.secrets where nom = 'agent_tick')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 290000
  );
  $$
);
