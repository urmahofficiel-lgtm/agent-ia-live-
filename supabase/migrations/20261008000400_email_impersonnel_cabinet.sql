-- Adresses impersonnelles (Belgique) : aussi « archi@ », « cabinet@ »… et
-- l'adresse au nom du cabinet (« a2rc@a2rc.be »). Même règle que
-- emailImpersonnel() (src/lib/prospection.ts).

create or replace function prive.email_impersonnel(p_email text) returns boolean
language sql immutable set search_path = '' as $$
  select split_part(split_part(a, '@', 1), '.', 1) <> ''
     and (regexp_replace(split_part(a, '@', 1), '[.+_-].*$', '') = any (array[
            'contact', 'info', 'infos', 'bureau', 'secretariat', 'secretaria', 'agence', 'office',
            'accueil', 'admin', 'administration', 'hello', 'bonjour', 'mail', 'studio', 'atelier',
            'projets', 'projet', 'direction', 'reception', 'team', 'equipe', 'general', 'courrier',
            'archi', 'arch', 'architecte', 'architectes', 'architecture', 'cabinet'])
          or split_part(a, '@', 1) = split_part(split_part(a, '@', 2), '.', 1))
    from (select lower(btrim(coalesce(p_email, ''))) as a) e
$$;
