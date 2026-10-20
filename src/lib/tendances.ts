import { z } from "zod";

// Veille des tendances du domaine de la marque : chaque jour, quelques
// recherches web (actualité, réglementation, sujets qui font parler la
// clientèle), résumées par l'IA en sujets d'actualité, mots de la cible et
// hashtags réellement employés. Le résumé rejoint la fiche de la marque.
// Logique pure ; la recherche et l'enregistrement sont dans tendances.server.ts.

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

const ligne = (contexte: string, nom: string) => contexte.match(new RegExp(`^${nom} : (.+)$`, "m"))?.[1]?.trim() ?? "";

// Requêtes de recherche du jour, d'après la fiche (activité, clientèle, zone).
export function requetesTendances(contexte: string, jour: string): string[] {
  const d = new Date(`${jour}T12:00:00Z`);
  const periode = `${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  if (/btp|bâtiment|chantier|artisan/i.test(contexte)) {
    return [
      `actualité bâtiment artisans ${periode}`,
      `réglementation BTP nouveautés artisans ${periode}`,
      `rénovation énergétique aides chantier actualité ${periode}`,
      `tendances TikTok Instagram artisans du bâtiment ${periode}`,
    ];
  }
  const activite = ligne(contexte, "Activité") || ligne(contexte, "Marque");
  const cible = ligne(contexte, "Clientèle visée");
  return [`actualité ${activite} ${periode}`, `${cible || activite} tendances ${periode}`, `${activite} réseaux sociaux tendances ${periode}`].filter((r) => r.trim().length > 10);
}

export type ResultatRecherche = { title?: string; url?: string; content?: string; published_date?: string };

export function consigneTendances(resultats: ResultatRecherche[], contexte: string, jour: string) {
  const extraits = resultats
    .slice(0, 16)
    .map((r, i) => `[${i + 1}] ${r.title ?? ""}${r.published_date ? ` (${r.published_date.slice(0, 10)})` : ""}\n${(r.content ?? "").replace(/\s+/g, " ").slice(0, 500)}\n${r.url ?? ""}`)
    .join("\n\n");
  return `Nous sommes le ${jour}. Tu fais la veille des réseaux sociaux d'une marque. Voici sa fiche :
${contexte.slice(0, 2500)}

Résultats de recherche web de la semaine :
${extraits}

À partir des résultats SEULEMENT (n'invente rien, aucun chiffre qui n'y figure pas), dégage ce qui intéresse la clientèle de la marque cette semaine :
- « sujets » : 3 à 5 sujets d'actualité ou de préoccupation de la cible, chacun avec un angle de publication pour la marque (sans promettre ce que la fiche ne dit pas) et le numéro de la source.
- « mots » : 5 à 10 mots ou expressions que la cible emploie vraiment (métiers, problèmes concrets, termes de chantier).
- « hashtags » : 6 à 10 hashtags que la cible utilise et recherche vraiment sur Instagram et TikTok (métiers, problèmes, lieux, en français), du plus large au plus précis. Interdits : hashtags inventés, en anglais, avec une année, ou au nom d'une fonctionnalité (#DevisIA, #BTP2026, #ConstructionTech…).
Réponds UNIQUEMENT par un objet JSON valide :
{"sujets": [{"titre": "...", "angle": "...", "source": 1}], "mots": ["..."], "hashtags": ["#..."]}`;
}

const schema = z.object({
  sujets: z
    .array(z.object({ titre: z.string().min(3).max(160), angle: z.string().max(300).catch(""), source: z.number().int().optional().catch(undefined) }))
    .min(1)
    .max(6),
  mots: z.array(z.string().max(60)).catch([]),
  hashtags: z.array(z.string()).catch([]),
});

export type Tendances = { resume: string; hashtags: string[] };

// Résumé prêt à ajouter à la fiche, ou null si la réponse est inutilisable.
export function lireTendances(reponse: string, resultats: ResultatRecherche[] = []): Tendances | null {
  const json = reponse.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  let brut: unknown;
  try {
    brut = JSON.parse(json);
  } catch {
    return null;
  }
  const r = schema.safeParse(brut);
  if (!r.success) return null;
  const hashtags = hashtagsPropres(r.data.hashtags).slice(0, 10);
  const sujets = r.data.sujets.map((s) => {
    const source = s.source ? resultats[s.source - 1]?.url : undefined;
    return `- ${s.titre}${s.angle ? ` → angle : ${s.angle}` : ""}${source ? ` (source : ${source})` : ""}`;
  });
  const mots = r.data.mots.map((m) => m.trim()).filter(Boolean).slice(0, 10);
  return {
    resume: [`Sujets du moment :`, ...sujets, mots.length ? `Mots de la cible : ${mots.join(", ")}` : ""].filter(Boolean).join("\n"),
    hashtags,
  };
}

// --- Hashtags --------------------------------------------------------------------

// Hashtags inventés ou hors cible (anglais, année, nom de fonctionnalité,
// jargon d'éditeur de logiciel) : personne ne les cherche.
const INTERDITS = new Set(
  [
    "btp2026", "btp2025", "btp2027", "digitalbtp", "constructiontech", "btpinnovation", "saas", "compliance",
    "openbanking", "devisia", "ia", "ai", "tech", "innovation", "digital", "startup", "software", "logiciel",
    "rgpd", "pme", "facturx", "proptech", "contech", "buildtech",
  ],
);

const cle = (h: string) => h.replace(/^#/, "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Hashtags valides : un mot, sans doublon, hors liste interdite ni année.
export function hashtagsPropres(liste: string[]): string[] {
  const vus = new Set<string>();
  const sortie: string[] = [];
  for (const brut of liste) {
    const h = `#${brut.trim().replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "")}`;
    const k = cle(h);
    if (k.length < 3 || INTERDITS.has(k) || /20\d\d/.test(k) || vus.has(k)) continue;
    vus.add(k);
    sortie.push(h);
  }
  return sortie;
}

// Nombre de hashtags par réseau : quelques-uns bien choisis valent mieux
// qu'une liste (Facebook et LinkedIn n'en tirent presque rien).
export const MAX_HASHTAGS: Record<string, number> = { tiktok: 4, instagram: 5, threads: 3, facebook: 2, linkedin: 3, youtube: 3, x: 2, bluesky: 2 };

// Texte final : hashtags interdits retirés, doublons supprimés, nombre limité
// selon le réseau, regroupés en fin de texte.
export function nettoyerHashtags(texte: string, plateforme?: string | null): string {
  const trouves = texte.match(/(^|\s)#[\p{L}\p{N}_]+/gu)?.map((h) => h.trim()) ?? [];
  if (!trouves.length) return texte;
  const garder = hashtagsPropres(trouves).slice(0, MAX_HASHTAGS[plateforme ?? ""] ?? 3);
  const corps = texte
    .replace(/(^|\s)#[\p{L}\p{N}_]+/gu, "$1")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return garder.length ? `${corps}\n\n${garder.join(" ")}` : corps;
}
