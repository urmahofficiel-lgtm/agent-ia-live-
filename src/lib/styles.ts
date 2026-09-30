// Styles créatifs des vidéos et des images : partagés par l'interface
// (menus, réglages) et le serveur (script, montage, composition).

export const STYLES_VIDEO = [
  { id: "classique", nom: "Classique", description: "Séquences filmées, textes à l'écran et voix off posée." },
  { id: "ugc", nom: "Face caméra (UGC)", description: "Ton parlé à la 1re personne, sous-titres mot à mot, plans courts." },
  { id: "avant_apres", nom: "Avant / après", description: "La situation de départ, puis la transformation." },
  { id: "etapes", nom: "Tutoriel en étapes", description: "Étapes numérotées 1, 2, 3 avec gros numéros." },
  { id: "top3", nom: "Top 3", description: "3 raisons ou 3 erreurs, en compte à rebours." },
] as const;

export const STYLES_IMAGE = [
  { id: "photo", nom: "Photo", description: "Photo réaliste, sans texte." },
  { id: "accroche", nom: "Accroche", description: "Photo et gros titre sur un bandeau lisible." },
  { id: "citation", nom: "Citation", description: "Fond sobre et une phrase forte." },
  { id: "promo", nom: "Affiche promo", description: "Titre, sous-titre et appel à l'action." },
] as const;

export type StyleVideo = (typeof STYLES_VIDEO)[number]["id"];
export type StyleImage = (typeof STYLES_IMAGE)[number]["id"];

export const STYLE_VIDEO_DEFAUT: StyleVideo = "classique";
export const STYLE_IMAGE_DEFAUT: StyleImage = "photo";

// Valeur inconnue (ancienne donnée, colonne absente…) : style par défaut.
export const lireStyleVideo = (x: unknown): StyleVideo =>
  STYLES_VIDEO.some((s) => s.id === x) ? (x as StyleVideo) : STYLE_VIDEO_DEFAUT;
export const lireStyleImage = (x: unknown): StyleImage =>
  STYLES_IMAGE.some((s) => s.id === x) ? (x as StyleImage) : STYLE_IMAGE_DEFAUT;

export const nomStyleVideo = (id: StyleVideo) => STYLES_VIDEO.find((s) => s.id === id)?.nom ?? id;
export const nomStyleImage = (id: StyleImage) => STYLES_IMAGE.find((s) => s.id === id)?.nom ?? id;
