-- Index sur les clés étrangères signalées par le linter Supabase.
create index evenements_tache_idx on public.evenements_taches (tache_id);
create index interactions_prospect_idx on public.interactions_prospects (prospect_id);
create index interactions_user_idx on public.interactions_prospects (user_id);
