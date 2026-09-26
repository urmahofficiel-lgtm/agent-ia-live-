import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Projet Supabase dédié à Agent IA Live — jamais celui de BTP Ecosystem.
const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const CLE = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

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
