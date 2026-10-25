-- Voix réalistes : doublage dans d'autres langues (celles de btp-ecosystem.com
-- et l'arabe). Une demande par langue ; l'écoute d'une même vidéo (texte
-- français, personnages, voix) est reprise d'un doublage déjà fait au lieu
-- d'être refaite.

alter table public.doublages
  add column if not exists langue text not null default 'fr'
    check (langue in ('fr', 'en', 'es', 'de', 'it', 'nl', 'pt', 'ar'));

drop function if exists public.agent_doublage_a_faire(text);
create function public.agent_doublage_a_faire(p_secret text)
returns table (id uuid, user_id uuid, source_url text, etape text, etude jsonb, segments jsonb, echecs int, contexte text, langue text, etude_source jsonb)
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
    select d.id, d.user_id, d.source_url, d.etape, d.etude, d.segments, d.echecs, prive.contexte_marque(d.user_id), d.langue,
           -- Écoute déjà faite pour la même vidéo (autre langue) : réutilisée.
           (select o.etude from public.doublages o
             where o.user_id = d.user_id and o.source_url = d.source_url and o.id <> d.id
               and o.etude ? 'repliques'
             order by (o.langue = 'fr') desc, o.updated_at desc
             limit 1)
      from public.doublages d where d.id = v_id;
end;
$$;
revoke all on function public.agent_doublage_a_faire(text) from public, authenticated;
grant execute on function public.agent_doublage_a_faire(text) to anon;
