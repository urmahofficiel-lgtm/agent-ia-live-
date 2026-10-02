-- Studio vidéo IA : une image + une consigne (prompt) → une vidéo de 10, 15,
-- 20 ou 30 secondes (Grok Imagine, xAI). Au-delà de 15 s, la vidéo est
-- prolongée par morceaux (segments). L'image est rangée dans le stockage
-- « animations » (dossier de l'utilisateur), la vidéo finale dans « videos ».

create table public.videos_ia (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  statut text not null default 'en_attente'
    check (statut in ('en_attente', 'en_cours', 'terminee', 'echouee')),
  image_chemin text not null,
  prompt text not null check (char_length(prompt) between 3 and 4000),
  duree integer not null check (duree in (10, 15, 20, 30)),
  format text not null default '9:16' check (format in ('9:16', '16:9', '1:1')),
  qualite text not null default 'standard' check (qualite in ('standard', 'premium')),
  -- Morceaux générés : [{ request_id, duree, genre: generation|prolongation, url, statut }]
  segments jsonb not null default '[]'::jsonb,
  progression integer not null default 0 check (progression between 0 and 100),
  cout_estime numeric(8, 2),
  resultat_url text,
  erreur text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index videos_ia_user_idx on public.videos_ia (user_id, created_at desc);
alter table public.videos_ia enable row level security;
create policy "proprietaire" on public.videos_ia
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create trigger videos_ia_updated_at before update on public.videos_ia
  for each row execute function public.toucher_updated_at();
alter publication supabase_realtime add table public.videos_ia;
