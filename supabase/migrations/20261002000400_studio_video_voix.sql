-- Studio vidéo IA parlant : analyse du personnage (âge, sexe) et de la phrase
-- à dire (langue) → voix adaptée (Gemini) → lèvres synchronisées (LatentSync).
-- voix : { parole, langue, age, sexe, dessin, consigne_visuelle, voix, levres }
-- etape : morceaux (animation) puis levres (voix + synchronisation).
alter table public.videos_ia
  add column voix jsonb,
  add column etape text not null default 'morceaux' check (etape in ('morceaux', 'levres')),
  add column video_muette text,
  add column audio_chemin text;
