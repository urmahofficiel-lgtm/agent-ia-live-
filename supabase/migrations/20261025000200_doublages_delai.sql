-- Doublage : une longue vidéo peut prendre plus d'une heure quand Gemini limite
-- les demandes par minute (écoute et voix espacées) : abandon après 3 heures.

create or replace function public.agent_doublage_a_faire(p_secret text)
returns table (id uuid, user_id uuid, source_url text, etape text, etude jsonb, segments jsonb, echecs int, contexte text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_id uuid;
begin
  if not prive.secret_valide(p_secret) then
    raise exception 'secret invalide';
  end if;
  -- Bloqué depuis plus de 3 heures : abandonné.
  update public.doublages d
     set statut = 'echec', erreur = coalesce(d.erreur, 'Doublage trop long (plus de 3 heures) : abandonné.'), pris_le = null, updated_at = now()
   where d.statut in ('en_attente', 'en_cours') and d.created_at < now() - interval '3 hours';
  select d.id into v_id from public.doublages d
   where d.statut in ('en_attente', 'en_cours')
     and (d.pris_le is null or d.pris_le < now() - interval '6 minutes')
   order by d.created_at
   limit 1
   for update skip locked;
  if v_id is null then
    return;
  end if;
  update public.doublages d set statut = 'en_cours', pris_le = now(), updated_at = now() where d.id = v_id;
  return query
    select d.id, d.user_id, d.source_url, d.etape, d.etude, d.segments, d.echecs, prive.contexte_marque(d.user_id)
      from public.doublages d where d.id = v_id;
end;
$$;
