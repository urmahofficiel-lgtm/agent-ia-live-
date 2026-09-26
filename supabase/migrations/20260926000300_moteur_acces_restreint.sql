-- Seul le moteur (rôle anon + secret) appelle ces fonctions.
revoke execute on function public.agent_taches_dues(text) from authenticated;
revoke execute on function public.agent_maj_tache(text, uuid, text, jsonb, text, text) from authenticated;
