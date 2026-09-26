import { createClient } from "@supabase/supabase-js";

// Valeurs publiques du projet (voir src/lib/supabase.ts).
export const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://idabdhnsciymoauyogmj.supabase.co";
export const SUPABASE_CLE =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_VvarkoTJdJPMo9CIdSuZOw_o6p_kiff";

// Client serveur qui agit AVEC le jeton de l'utilisateur : les règles RLS
// s'appliquent, il ne touche qu'à ses propres données.
export async function utilisateurDepuisJeton(jeton: string) {
  const sb = createClient(SUPABASE_URL, SUPABASE_CLE, {
    global: { headers: { Authorization: `Bearer ${jeton}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.getUser(jeton);
  if (error || !data.user) throw new Error("Session expirée, reconnectez-vous.");
  return { sb, user: data.user };
}

// Client anonyme pour le moteur (n'agit qu'à travers les fonctions protégées
// par le secret du moteur).
export function clientMoteur() {
  return createClient(SUPABASE_URL, SUPABASE_CLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
