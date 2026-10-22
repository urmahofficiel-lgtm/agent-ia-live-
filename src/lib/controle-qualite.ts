// Contrôle qualité juste avant l'envoi : une publication qui échoue n'est pas
// publiée, elle repasse « À valider » avec la raison. Logique pure, partagée
// par le moteur (blocage) et la page Publications (avertissements).

import { MARCHE_DEFAUT } from "./marches";
import { promessesDans } from "./croissance";

// Mots très fréquents propres à chaque langue : de quoi reconnaître la langue
// d'un post sans service extérieur.
const MOTS: Record<string, string[]> = {
  fr: ["les", "des", "et", "est", "pour", "avec", "vous", "votre", "vos", "dans", "pas", "qui", "du", "au", "ce", "cette", "sans", "sur", "une", "plus", "fini", "chantier"],
  en: ["the", "and", "you", "your", "for", "with", "is", "are", "to", "of", "this", "that", "without", "our", "it", "how", "on"],
  de: ["der", "die", "das", "und", "ist", "mit", "für", "sie", "nicht", "ein", "eine", "auf", "den", "dem", "zu", "von", "ohne", "ihre", "jetzt", "mehr"],
  it: ["il", "gli", "è", "per", "che", "non", "una", "dei", "delle", "del", "sul", "senza", "più", "tuo", "tua", "della", "con", "nel", "i", "di", "ogni", "ed", "già", "su", "alla", "sono"],
  es: ["el", "los", "las", "y", "es", "para", "que", "no", "una", "del", "sin", "más", "tu", "tus", "con", "obra"],
  pt: ["os", "é", "para", "com", "que", "não", "um", "uma", "do", "da", "em", "sem", "mais", "você", "teu", "tua", "obras"],
  nl: ["het", "en", "is", "voor", "met", "je", "jouw", "niet", "een", "op", "van", "zonder", "meer"],
};

export const NOMS_LANGUES: Record<string, string> = {
  fr: "français",
  en: "anglais",
  de: "allemand",
  it: "italien",
  es: "espagnol",
  pt: "portugais",
  nl: "néerlandais",
};

// Langue la plus probable d'un texte (« fr », « de »…), ou null si le texte
// est trop court ou trop ambigu pour trancher : on ne bloque pas au hasard.
export function langueProbable(texte: string): string | null {
  const mots = texte
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/#\S+/g, " ")
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
  const scores = Object.entries(MOTS)
    .map(([langue, liste]) => [langue, mots.filter((m) => liste.includes(m)).length] as const)
    .sort((a, b) => b[1] - a[1]);
  const [premier, second] = scores;
  if (premier[1] < 3 || premier[1] < second[1] * 1.5) return null;
  return premier[0];
}

const normaliser = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Même sujet sur le même réseau : pas deux fois en 3 jours.
export const DELAI_DOUBLON_H = 72;
export const TEXTE_MINIMUM = 15;

// `croissance` : publication du mode croissance (promesses intenables bloquées).
export type APublier = { plateforme: string | null; titre: string; marche?: string | null; texte: string | null; croissance?: boolean };
export type DejaPubliee = { plateforme: string | null; titre: string; publiee_le: string | null };

// Publication prévue dans les prochaines 24 h (ou déjà due) : l'écran de
// relecture avant envoi. Le pilote planifie la journée vers 5 h du matin.
export function estProchaine(planifiee: string | null | undefined, maintenant = Date.now()) {
  if (!planifiee) return false;
  return Date.parse(planifiee) <= maintenant + 86_400_000;
}

// Raisons de bloquer la publication (liste vide : tout va bien).
export function controlerPublication(p: APublier, recentes: DejaPubliee[], maintenant = Date.now()): string[] {
  const raisons: string[] = [];
  const texte = (p.texte ?? "").trim();
  if (texte.length < TEXTE_MINIMUM) raisons.push("texte vide ou presque vide");

  const attendue = (p.marche || MARCHE_DEFAUT).slice(0, 2);
  const lue = texte ? langueProbable(texte) : null;
  if (lue && lue !== attendue) raisons.push(`texte en ${NOMS_LANGUES[lue]} au lieu du ${NOMS_LANGUES[attendue] ?? attendue}`);

  const titre = normaliser(p.titre);
  const doublon = recentes.some(
    (r) =>
      r.plateforme === p.plateforme &&
      normaliser(r.titre) === titre &&
      r.publiee_le !== null &&
      maintenant - new Date(r.publiee_le).getTime() < DELAI_DOUBLON_H * 3_600_000,
  );
  if (doublon) raisons.push(`même sujet déjà publié sur ce réseau il y a moins de ${DELAI_DOUBLON_H / 24} jours`);
  if (p.croissance) {
    const promesses = promessesDans(texte);
    if (promesses.length) raisons.push(`promesse impossible à tenir (${promesses.join(", ")})`);
  }
  return raisons;
}
