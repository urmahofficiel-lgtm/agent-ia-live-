import type { Source } from "./decoupe-script";

// Recherche web (Tavily, clé TAVILY_API_KEY, offre gratuite de 1 000 crédits
// par mois : « basic » = 1 crédit, « advanced » = 2). Pages de fond, pas
// d'actualité. L'IA ne peut écrire que ce qu'elles contiennent.
export async function chercherWeb(requete: string, profondeur: "basic" | "advanced" = "basic"): Promise<Source[]> {
  const cle = process.env.TAVILY_API_KEY;
  if (!cle) return [];
  try {
    const r = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(25_000),
      body: JSON.stringify({ query: requete.slice(0, 300), topic: "general", max_results: 5, search_depth: profondeur, include_raw_content: false }),
    });
    if (!r.ok) return [];
    const j = (await r.json()) as { results?: { title?: string; url?: string; content?: string }[] };
    return (j.results ?? []).flatMap((x) => (x.url && x.content && x.content.length > 150 ? [{ titre: x.title ?? x.url, url: x.url, texte: x.content }] : [])).slice(0, 5);
  } catch {
    return [];
  }
}

export const rechercherHistoire = (sujet: string) => chercherWeb(sujet, "advanced");

// Plusieurs recherches, une page n'est gardée qu'une fois.
export async function rechercherPlusieurs(requetes: string[]): Promise<Source[]> {
  const res = await Promise.all(requetes.map((q, i) => chercherWeb(q, i === 0 ? "advanced" : "basic")));
  return [...new Map(res.flat().map((s) => [s.url, s])).values()].slice(0, 10);
}
