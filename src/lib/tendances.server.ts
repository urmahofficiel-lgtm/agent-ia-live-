import type { SupabaseClient } from "@supabase/supabase-js";
import { demanderIA } from "./ia.server";
import { consigneTendances, lireTendances, requetesTendances, type ResultatRecherche } from "./tendances";

// Recherche web d'actualité (Tavily, offre gratuite : 1 000 recherches par mois,
// clé TAVILY_API_KEY) : résultats de la semaine, en France.
async function chercher(requete: string, cle: string): Promise<ResultatRecherche[]> {
  try {
    const r = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({ query: requete, topic: "news", days: 7, max_results: 5, search_depth: "basic", country: "france" }),
    });
    if (!r.ok) return [];
    return ((await r.json()) as { results?: ResultatRecherche[] }).results ?? [];
  } catch {
    return [];
  }
}

// Veille du jour d'un compte : faite une fois par jour (avant la
// planification du pilote), puis ajoutée à sa fiche pour 3 jours. Renvoie le
// résumé (déjà fait ou nouveau), ou null si la recherche n'a rien donné.
export async function veilleDuJour(sb: SupabaseClient, secret: string, user: string, contexte: string | null, jour: string, echeance: number): Promise<string | null> {
  const { data: deja, error } = await sb.rpc("agent_tendances_du_jour", { p_secret: secret, p_user: user, p_jour: jour });
  if (error) return null; // migration absente : pas de veille
  if (deja) return deja as string;
  const cle = process.env.TAVILY_API_KEY;
  if (!cle || !contexte || Date.now() > echeance - 50_000) return null;

  const resultats = (await Promise.all(requetesTendances(contexte, jour).map((q) => chercher(q, cle)))).flat();
  // Une même page peut sortir de plusieurs recherches.
  const uniques = [...new Map(resultats.filter((r) => r.url && r.content).map((r) => [r.url, r])).values()];
  if (uniques.length < 3) return null;
  const reponse = await demanderIA(consigneTendances(uniques, contexte, jour), {
    systeme: "Tu fais la veille des réseaux sociaux d'une petite entreprise. Tu réponds uniquement en JSON valide.",
    maxTokens: 1500,
    delaiTotal: Math.max(20_000, Math.min(50_000, echeance - Date.now() - 20_000)),
  });
  const t = lireTendances(reponse, uniques);
  if (!t) return null;
  await sb.rpc("agent_enregistrer_tendances", { p_secret: secret, p_user: user, p_jour: jour, p_resume: t.resume, p_hashtags: t.hashtags });
  return t.resume;
}
