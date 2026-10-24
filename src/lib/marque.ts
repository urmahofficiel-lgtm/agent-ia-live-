// Nom de la marque du compte et marques à ne jamais citer (anciennes fiches :
// un autre projet analysé par erreur, un ancien nom). Lus dans la fiche de
// la marque (contexte), logique pure.

export const LIGNE_MARQUE = "Marque : ";
export const LIGNE_AUTRES_MARQUES = "Autres marques à ne JAMAIS citer (anciennes fiches) : ";

const ligne = (contexte: string | null | undefined, debut: string) =>
  (contexte ?? "")
    .split("\n")
    .find((l) => l.startsWith(debut))
    ?.slice(debut.length)
    .trim() ?? "";

export const nomDeLaMarque = (contexte: string | null | undefined) => ligne(contexte, LIGNE_MARQUE);

export function marquesInterdites(contexte: string | null | undefined): string[] {
  const nom = cle(nomDeLaMarque(contexte));
  return ligne(contexte, LIGNE_AUTRES_MARQUES)
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length >= 3 && cle(x) !== nom);
}

const cle = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Marques interdites citées dans un texte (mot entier, sans tenir compte des
// accents ni des majuscules).
export function marquesEtrangeres(texte: string, contexte: string | null | undefined): string[] {
  const t = cle(texte);
  return marquesInterdites(contexte).filter((m) => new RegExp(`(^|[^\\p{L}\\p{N}])${echapper(cle(m))}($|[^\\p{L}\\p{N}])`, "u").test(t));
}
