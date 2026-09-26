import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Projet Supabase dédié à Agent IA Live — jamais celui de BTP Ecosystem.
//
// Ces deux valeurs par défaut sont PUBLIQUES par nature (visibles dans le
// navigateur de toute façon) : la sécurité repose sur les politiques RLS.
// Les variables d'environnement Vercel, si définies, prennent le dessus.
const URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || "https://idabdhnsciymoauyogmj.supabase.co";
const CLE =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  "sb_publishable_VvarkoTJdJPMo9CIdSuZOw_o6p_kiff";

let client: SupabaseClient | undefined;

export function supabaseConfigure() {
  return Boolean(URL && CLE);
}

export function supabase(): SupabaseClient {
  if (!URL || !CLE) {
    throw new Error(
      "VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY manquantes (voir .env.example).",
    );
  }
  client ??= createClient(URL, CLE, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return client;
}
