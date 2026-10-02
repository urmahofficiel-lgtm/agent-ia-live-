-- Studio vidéo IA, version gratuite (Wan 2.2 sur Hugging Face) : la vidéo est
-- calculée par morceaux de 5 s, un morceau par appel ; « verrou » empêche deux
-- calculs simultanés de la même vidéo.
alter table public.videos_ia add column verrou timestamptz;
comment on column public.videos_ia.verrou is 'Morceau en cours de calcul (Hugging Face) : un seul calcul à la fois par vidéo.';
comment on column public.videos_ia.segments is 'Morceaux de 5 s déjà calculés : [{ numero, duree, chemin }] (stockage videos).';
