// Veille concurrents hebdomadaire (accord de Younes du 06/11/2026) : chaque
// lundi, l'agent relit les pages d'accueil et de prix d'Obat, Batappli et
// Tolteck (changement d'offre ou de prix), et, avec Apify (APIFY_TOKEN), les
// vidéos TikTok de la semaine d'Obat et Batappli et leurs vues. L'IA en tire un
// court rapport et 3 idées de contenus pour nous. Rien n'est publié ici, et
// nos publications ne citent jamais un concurrent.

export type Concurrent = { nom: string; pages: string[]; tiktok: string | null };

export const CONCURRENTS: Concurrent[] = [
  { nom: "Obat", pages: ["https://www.obat.fr", "https://www.obat.fr/tarifs"], tiktok: "obat_logiciel" },
  { nom: "Batappli", pages: ["https://www.batappli.fr", "https://www.batappli.fr/tarifs"], tiktok: "batappli" },
  { nom: "Tolteck", pages: ["https://www.tolteck.com", "https://www.tolteck.com/tarifs"], tiktok: null },
];

const ENTITES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", euro: "€" };

// Texte lisible d'une page (sans scripts, styles ni balises), borné.
export function textePage(html: string, max = 5000): string {
  const corps = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;
  return corps
    .replace(/<(script|style|svg|noscript|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (t, n) => ENTITES[n.toLowerCase()] ?? t)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

// Empreinte courte d'un texte (FNV-1a), pour voir si une page a changé.
export function empreinte(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export type VideoConcurrent = { compte: string; date: string; vues: number; likes: number; commentaires: number; carrousel: boolean; texte: string };

// Vidéos TikTok renvoyées par l'acteur Apify clockworks/tiktok-scraper.
export function lireVideos(items: unknown): VideoConcurrent[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((x: Record<string, unknown>) => {
      const auteur = (x.authorMeta ?? {}) as Record<string, unknown>;
      return {
        compte: String(auteur.name ?? ""),
        date: String(x.createTimeISO ?? "").slice(0, 10),
        vues: Number(x.playCount ?? 0) || 0,
        likes: Number(x.diggCount ?? 0) || 0,
        commentaires: Number(x.commentCount ?? 0) || 0,
        carrousel: x.isSlideshow === true,
        texte: String(x.text ?? "").replace(/\s+/g, " ").trim().slice(0, 300),
      };
    })
    .filter((v) => v.compte && /^\d{4}-\d{2}-\d{2}$/.test(v.date));
}

export type PageLue = { concurrent: string; url: string; texte: string; changee: boolean };

export function consigneVeilleConcurrents(pages: PageLue[], videos: VideoConcurrent[], depuis: string): string {
  const recentes = videos.filter((v) => v.date >= depuis);
  const meilleures = [...videos].sort((a, b) => b.vues - a.vues).slice(0, 3);
  const ligne = (v: VideoConcurrent) => `- @${v.compte}, ${v.date}, ${v.vues} vues, ${v.likes} j'aime, ${v.commentaires} commentaires${v.carrousel ? ", carrousel" : ""} : « ${v.texte} »`;
  return [
    "Tu fais la veille concurrentielle hebdomadaire de BTP Ecosystem (logiciel pour artisans et architectes : devis IA, analyse d'appels d'offres, suivi de chantier). Concurrents : Obat, Batappli, Tolteck.",
    "1) Pages des concurrents (texte brut ; « CHANGÉE » = modifiée depuis la semaine dernière) :",
    ...pages.map((p) => `### ${p.concurrent} — ${p.url}${p.changee ? " — CHANGÉE" : ""}\n${p.texte.slice(0, 2500)}`),
    `2) Leurs vidéos TikTok depuis le ${depuis} :`,
    ...(recentes.length ? recentes.map(ligne) : ["(aucune)"]),
    "Leurs vidéos qui ont le mieux marché (parmi les dernières) :",
    ...(meilleures.length ? meilleures.map(ligne) : ["(pas de données)"]),
    "Réponds en JSON : {\"rapport\": \"5 lignes au plus, en français simple : offres et prix actuels (seulement ceux lus dans les pages), ce qui a changé, ce qui marche sur leur TikTok\", \"idees\": [\"3 idées de publications pour BTP Ecosystem inspirées de ce qui marche chez eux, sans jamais les citer ni les copier\"]}.",
    "N'invente aucun chiffre ni aucune offre : seulement ce qui est écrit ci-dessus.",
  ].join("\n");
}

export function lireRapport(reponse: string): { rapport: string; idees: string[] } | null {
  const brut = reponse.match(/\{[\s\S]*\}/)?.[0];
  if (!brut) return null;
  try {
    const j = JSON.parse(brut) as { rapport?: unknown; idees?: unknown };
    const rapport = typeof j.rapport === "string" ? j.rapport.trim().slice(0, 1500) : "";
    const idees = Array.isArray(j.idees) ? j.idees.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim().slice(0, 300)).slice(0, 3) : [];
    return rapport ? { rapport, idees } : null;
  } catch {
    return null;
  }
}
