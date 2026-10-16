// Liens suivis : les liens d'une publication sont remplacés par un lien court
// qui compte les clics (/l/<code>) puis redirige vers l'adresse d'origine.
// Fonctions pures, testables.

export const URL_LIENS = "https://agent-ia-live.vercel.app/l/";

// Réseaux où un lien dans le texte est cliquable (sur Instagram et TikTok, il
// ne l'est pas : inutile de le raccourcir).
export const RESEAUX_LIENS_CLIQUABLES = ["facebook", "linkedin", "x", "threads", "bluesky", "telegram", "youtube", "reddit", "google_business"];

export const lienCliquable = (plateforme: string) => RESEAUX_LIENS_CLIQUABLES.includes(plateforme);

// Liens d'un texte, sans la ponctuation qui les suit (« … sur https://site.fr. »).
export function trouverLiens(texte: string): string[] {
  const liens = texte.match(/https?:\/\/[^\s<>"«»]+/g) ?? [];
  return [...new Set(liens.map((l) => l.replace(/[.,;:!?)\]]+$/, "")).filter((l) => !l.startsWith(URL_LIENS) && l.length <= 2000))];
}

// Remplace chaque lien connu par son lien court (les autres restent tels quels).
export function remplacerLiens(texte: string, codes: Map<string, string>) {
  let sortie = texte;
  // Les plus longs d'abord : « site.fr/tarifs » avant « site.fr ».
  for (const [url, code] of [...codes].sort((a, b) => b[0].length - a[0].length)) {
    sortie = sortie.split(url).join(`${URL_LIENS}${code}`);
  }
  return sortie;
}

// Robots d'aperçu (Facebook, LinkedIn, messageries…) : ils ouvrent le lien pour
// afficher la vignette, ce n'est pas un vrai clic.
export const estRobot = (agent: string | null | undefined) =>
  !agent || /bot|crawl|spider|preview|facebookexternalhit|facebookcatalog|embedly|slack|whatsapp|telegram|discord|skype|curl|wget|python|node-fetch|axios|headless/i.test(agent);

export const codeValide = (code: string) => /^[a-z0-9]{7}$/.test(code);
