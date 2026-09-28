-- Profil Facebook perso : aucune API ne permet d'y publier. L'agent prépare la
-- publication à l'heure prévue, puis la place « à partager » : l'utilisateur la
-- publie en 1 clic depuis son téléphone.
alter table public.taches drop constraint if exists taches_statut_check;
alter table public.taches add constraint taches_statut_check
  check (statut in ('en_attente', 'a_valider', 'en_cours', 'a_partager', 'terminee', 'echouee', 'annulee'));
