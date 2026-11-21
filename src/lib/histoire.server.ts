import type { Source } from "./decoupe-script";

// Recherche web de l'histoire (Tavily, clé TAVILY_API_KEY, offre gratuite) :
// pages de fond (pas d'actualité), en français. L'IA ne peut écrire que ce
// qu'elles contiennent.
export async function rechercherHistoire(sujet: string): Promise<Source[]> {
  const cle = process.env.TAVILY_API_KEY;
  if (!cle) return [];
  try {
    const r = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(25_000),
      body: JSON.stringify({ query: sujet.slice(0, 300), topic: "general", max_results: 5, search_depth: "advanced", include_raw_content: false }),
    });
    if (!r.ok) return [];
    const j = (await r.json()) as { results?: { title?: string; url?: string; content?: string }[] };
    return (j.results ?? []).flatMap((x) => (x.url && x.content && x.content.length > 200 ? [{ titre: x.title ?? x.url, url: x.url, texte: x.content }] : [])).slice(0, 5);
  } catch {
    return [];
  }
}
