// Studio vidéo IA : image + consigne → vidéo de 10 à 30 s, gratuitement, avec
// Wan 2.2 sur Hugging Face (clé HF_TOKEN). Le modèle fait des morceaux de
// 5 s : chaque morceau repart de la dernière image du précédent, puis on
// recolle le tout.

export const DUREES = [10, 15, 20, 30] as const;
export type Duree = (typeof DUREES)[number];

export const SECONDES_PAR_MORCEAU = 5;

export const nombreMorceaux = (duree: number) =>
  Math.ceil(duree / SECONDES_PAR_MORCEAU);

// Durée du morceau n (0, 1, …) : 5 s, le dernier complète au besoin.
export function dureeMorceau(duree: number, n: number): number {
  const reste = duree - n * SECONDES_PAR_MORCEAU;
  return Math.max(1, Math.min(SECONDES_PAR_MORCEAU, reste));
}

export type Morceau = { numero: number; duree: number; chemin: string };

export const progression = (duree: number, faits: number) =>
  Math.min(99, Math.round((faits / nombreMorceaux(duree)) * 100));

// Consigne d'un morceau de suite : même scène, sans coupure.
export function consigneMorceau(prompt: string, n: number): string {
  const base = prompt.trim();
  return n === 0
    ? base
    : `${base}. Continue the same scene smoothly, same characters and style, no cut.`;
}
