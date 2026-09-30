-- Connecteur MCP : piloter son agent depuis Claude, ChatGPT…
-- Chaque utilisateur crée une clé personnelle (seule son empreinte SHA-256 est
-- stockée). Le serveur MCP appelle les fonctions ci-dessous avec le secret du
-- moteur ET l'empreinte : l'utilisateur est retrouvé à partir de la clé, jamais
-- fourni par l'appelant.

create table public.cles_connecteur (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  empreinte text not null unique,
  nom text not null default 'Claude',
  dernier_usage timestamptz,
  created_at timestamptz not null default now()
);
alter table public.cles_connecteur enable row level security;
create policy "proprietaire" on public.cles_connecteur for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create function prive.utilisateur_connecteur(p_empreinte text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  update public.cles_connecteur set dernier_usage = now()
   where empreinte = p_empreinte
  returning user_id into v_user;
  if v_user is null then
    raise exception 'cle invalide';
  end if;
  return v_user;
end;
$$;

-- Comptes connectés (réseaux disponibles).
create function public.mcp_comptes(p_secret text, p_empreinte text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  if not prive.secret_valide(p_secret) then raise exception 'secret invalide'; end if;
  v_user := prive.utilisateur_connecteur(p_empreinte);
  return coalesce((
    select jsonb_agg(jsonb_build_object('reseau', c.plateforme, 'compte', c.nom_utilisateur, 'via', c.fournisseur))
      from public.comptes_connectes c
     where c.user_id = v_user and c.statut = 'connecte'
  ), '[]'::jsonb);
end;
$$;

-- Publications, les plus récentes d'abord.
create function public.mcp_publications(p_secret text, p_empreinte text, p_statut text, p_limite int)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  if not prive.secret_valide(p_secret) then raise exception 'secret invalide'; end if;
  v_user := prive.utilisateur_connecteur(p_empreinte);
  return coalesce((
    select jsonb_agg(x order by x.cree_le desc)
      from (
        select t.id, t.titre, t.plateforme as reseau, t.statut, t.planifiee_pour as prevue_pour,
               t.resultat ->> 'brouillon' as texte,
               t.resultat ->> 'visuel_url' as image,
               t.resultat ->> 'video_url' as video,
               t.resultat ->> 'publie_le' as publiee_le,
               t.created_at as cree_le
          from public.taches t
         where t.user_id = v_user and t.type = 'publication'
           and (p_statut is null or t.statut = p_statut)
         order by t.created_at desc
         limit least(greatest(coalesce(p_limite, 20), 1), 50)
      ) x
  ), '[]'::jsonb);
end;
$$;

-- Nouvelle publication (une par réseau). L'agent rédige le texte et crée
-- l'image à son prochain passage (5 min). p_valider : planifiée directement.
create function public.mcp_creer_publication(
  p_secret text, p_empreinte text, p_titre text, p_consigne text, p_reseaux text[],
  p_planifiee_pour timestamptz, p_valider boolean
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_ids jsonb := '[]'::jsonb;
  v_id uuid;
  v_reseau text;
begin
  if not prive.secret_valide(p_secret) then raise exception 'secret invalide'; end if;
  v_user := prive.utilisateur_connecteur(p_empreinte);
  foreach v_reseau in array p_reseaux loop
    insert into public.taches (user_id, type, plateforme, titre, consigne, statut, planifiee_pour)
    values (v_user, 'publication', v_reseau, left(p_titre, 200), left(p_consigne, 4000),
            case when p_valider then 'en_attente' else 'a_valider' end, p_planifiee_pour)
    returning id into v_id;
    v_ids := v_ids || jsonb_build_object('id', v_id, 'reseau', v_reseau);
  end loop;
  return v_ids;
end;
$$;

-- Actions sur une publication : valider, annuler, publier_maintenant,
-- reprogrammer, modifier le texte.
create function public.mcp_modifier_publication(
  p_secret text, p_empreinte text, p_id uuid, p_action text, p_planifiee_pour timestamptz, p_texte text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_statut text;
begin
  if not prive.secret_valide(p_secret) then raise exception 'secret invalide'; end if;
  v_user := prive.utilisateur_connecteur(p_empreinte);
  select statut into v_statut from public.taches where id = p_id and user_id = v_user and type = 'publication';
  if v_statut is null then raise exception 'publication introuvable'; end if;
  if v_statut in ('terminee', 'en_cours') and p_action <> 'modifier_texte' then
    raise exception 'publication deja publiee ou en cours de publication';
  end if;

  if p_action = 'valider' then
    update public.taches set statut = 'en_attente' where id = p_id;
  elsif p_action = 'publier_maintenant' then
    update public.taches set statut = 'en_attente', planifiee_pour = now() where id = p_id;
  elsif p_action = 'reprogrammer' then
    update public.taches set planifiee_pour = p_planifiee_pour where id = p_id;
  elsif p_action = 'annuler' then
    update public.taches set statut = 'annulee' where id = p_id;
  elsif p_action = 'modifier_texte' then
    if v_statut = 'terminee' then raise exception 'publication deja publiee'; end if;
    update public.taches
       set resultat = coalesce(resultat, '{}'::jsonb) || jsonb_build_object('brouillon', left(p_texte, 5000))
     where id = p_id;
  else
    raise exception 'action inconnue';
  end if;

  return (select jsonb_build_object('id', t.id, 'statut', t.statut, 'prevue_pour', t.planifiee_pour)
            from public.taches t where t.id = p_id);
end;
$$;

-- Journal « En direct » : ce que l'agent a fait récemment.
create function public.mcp_journal(p_secret text, p_empreinte text, p_limite int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  if not prive.secret_valide(p_secret) then raise exception 'secret invalide'; end if;
  v_user := prive.utilisateur_connecteur(p_empreinte);
  return coalesce((
    select jsonb_agg(x order by x.quand desc)
      from (
        select e.created_at as quand, e.niveau, e.message, e.tache_id as publication
          from public.evenements_taches e
         where e.user_id = v_user
         order by e.created_at desc
         limit least(greatest(coalesce(p_limite, 20), 1), 100)
      ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function prive.utilisateur_connecteur(text) from public;
revoke all on function public.mcp_comptes(text, text) from public, authenticated;
revoke all on function public.mcp_publications(text, text, text, int) from public, authenticated;
revoke all on function public.mcp_creer_publication(text, text, text, text, text[], timestamptz, boolean) from public, authenticated;
revoke all on function public.mcp_modifier_publication(text, text, uuid, text, timestamptz, text) from public, authenticated;
revoke all on function public.mcp_journal(text, text, int) from public, authenticated;
grant execute on function public.mcp_comptes(text, text) to anon;
grant execute on function public.mcp_publications(text, text, text, int) to anon;
grant execute on function public.mcp_creer_publication(text, text, text, text, text[], timestamptz, boolean) to anon;
grant execute on function public.mcp_modifier_publication(text, text, uuid, text, timestamptz, text) to anon;
grant execute on function public.mcp_journal(text, text, int) to anon;
