// Nettoyage d'un post rédigé par l'IA avant publication : les réseaux
// affichent le texte brut, donc pas de markdown ; et le titre interne de la
// publication ne doit pas apparaître en tête du post.
export function nettoyerPost(texte: string, titre?: string | null) {
  let t = texte
    .replace(/\*\*(.+?)\*\*/gs, "$1")
    .replace(/__(.+?)__/gs, "$1")
    .replace(/^#{1,6}\s+/gm, "") // titres markdown (les hashtags, collés au mot, sont gardés)
    .replace(/<(https?:\/\/[^>\s]+)>/g, "$1")
    .replace(/[ \t]+$/gm, "")
    .trim();
  const cle = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  if (titre) {
    const [premiere, ...reste] = t.split("\n");
    if (cle(premiere) && cle(premiere) === cle(titre)) t = reste.join("\n").trim();
  }
  return t.replace(/\n{3,}/g, "\n\n");
}

// Réseaux qui montrent beaucoup moins une publication contenant un lien
// (Facebook, LinkedIn) ou où le lien n'est pas cliquable (TikTok, Instagram).
export const RESEAUX_SANS_LIEN = ["facebook", "facebook_groupe", "linkedin", "tiktok", "instagram", "threads"];

// Consigne propre à chaque réseau (longueur, accroche, lien, hashtags).
export function reglesReseau(plateforme?: string | null, langue = "français"): string {
  switch (plateforme) {
    case "facebook":
      return `- Facebook (Reel) : première ligne = accroche de moins de 80 caractères ; 350 caractères maximum en tout ; termine par une question simple qui donne envie de commenter. AUCUN lien ni adresse de site (Facebook montre beaucoup moins les publications avec lien) : appel à l'action sans lien, par exemple « Essai gratuit : lien sur notre page ». 3 hashtags précis en ${langue}.`;
    case "facebook_groupe":
      return "- Groupe Facebook (règles prioritaires sur la fiche) : le post est partagé par le fondateur lui-même, en son nom, dans des groupes d'artisans et d'architectes où la publicité est mal vue. Écris à la première personne (« je »), comme un pro qui parle à ses pairs, pas comme une marque. Commence par une situation de chantier ou une question concrète. Apporte d'abord une info ou un conseil utile ; l'outil n'arrive qu'en une phrase, à la fin, sans ton publicitaire (par exemple « je développe un outil pour ça ; si ça vous intéresse de le tester gratuitement, dites-le en commentaire »). Termine par une question ouverte qui donne envie de répondre. AUCUN lien, AUCUN hashtag, 2 emojis au plus, 600 caractères maximum.";
    case "linkedin":
      return "- LinkedIn : accroche sur 2 lignes courtes, paragraphes d'une phrase. AUCUN lien dans le texte (LinkedIn réduit la portée des posts avec lien) : invite à réagir en commentaire ou à écrire en message privé. 3 hashtags.";
    case "tiktok":
      return "- TikTok : 150 caractères maximum avant les hashtags, accroche directe. AUCUN lien (non cliquable) : « lien en bio ». 3 à 5 hashtags.";
    case "instagram":
    case "threads":
      return "- Instagram : accroche en première ligne. AUCUN lien (non cliquable) : « lien en bio ». 3 à 5 hashtags.";
    default:
      return "- Termine par l'appel à l'action de la fiche et le lien du site, écrit en entier.";
  }
}

// Groupes Facebook : pas de hashtag (ils font « publicité » dans un groupe).
export function sansHashtagsSiGroupe(texte: string, plateforme?: string | null): string {
  if (plateforme !== "facebook_groupe") return texte;
  return texte
    .replace(/(^|\s)#[\p{L}\p{N}_]+/gu, "$1")
    .split("\n")
    .map((l) => l.replace(/[ \t]{2,}/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Filet de sécurité : retire les liens qu'aurait ajoutés l'IA sur les réseaux
// où ils font baisser la portée.
export function sansLienSiReseau(texte: string, plateforme?: string | null): string {
  if (!plateforme || !RESEAUX_SANS_LIEN.includes(plateforme)) return texte;
  return texte
    .split("\n")
    .map((l) =>
      l
        .replace(/\bhttps?:\/\/\S+/gi, "")
        .replace(/\bwww\.[\w.-]+\.[a-z]{2,}\S*/gi, "")
        .replace(/\b[\w-]+\.(?:com|fr|io|net|org|eu)\b\/?\S*/gi, "")
        .replace(/\s*[:→👉-]\s*$/u, "")
        .replace(/[ \t]{2,}/g, " ")
        .trimEnd(),
    )
    .filter((l, i, tout) => l.trim() !== "" || (i > 0 && tout[i - 1].trim() !== ""))
    .join("\n")
    .trim();
}
