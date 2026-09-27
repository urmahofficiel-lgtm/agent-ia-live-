// Pexels : photos et vidéos libres de droits (usage commercial autorisé).
// Choix des fichiers : fonctions pures, testables.

export type FichierVideo = { link: string; width: number; height: number; file_type?: string; quality?: string | null };
export type VideoPexels = { id: number; duration: number; video_files: FichierVideo[] };
export type PhotoPexels = { id: number; src: Record<string, string> };

// Fichier vidéo vertical le plus léger qui reste net en 720x1280.
export function choisirFichierVertical(v: VideoPexels): FichierVideo | null {
  const candidats = v.video_files
    .filter((f) => f.file_type === "video/mp4" || f.link.includes(".mp4"))
    .filter((f) => f.height > f.width && f.width >= 540)
    .sort((a, b) => a.width - b.width);
  return candidats.find((f) => f.width >= 720) ?? candidats[candidats.length - 1] ?? null;
}

// Première vidéo assez longue pour la scène, avec un fichier vertical
// utilisable, et pas déjà utilisée dans la même vidéo.
export function choisirVideo(videos: VideoPexels[], dureeMin: number, exclus: ReadonlySet<number> = new Set()) {
  for (const v of videos) {
    if (exclus.has(v.id) || v.duration < Math.min(dureeMin, 4)) continue;
    const f = choisirFichierVertical(v);
    if (f) return { id: v.id, fichier: f };
  }
  return null;
}

export function lienPhoto(p: PhotoPexels, orientation: "portrait" | "paysage" | "carre") {
  if (orientation === "portrait") return p.src.portrait ?? p.src.large2x ?? p.src.large;
  if (orientation === "paysage") return p.src.landscape ?? p.src.large2x ?? p.src.large;
  return p.src.large2x ?? p.src.large;
}

// Pexels comprend le français si on le lui dit : on précise la langue quand
// les mots-clés sont en français.
export function langueRecherche(recherche: string) {
  return /[àâçéèêëîïôûùüÿœ]|\b(de|des|du|la|le|les|sur|avec|chantier|artisan|maison|bureau|ouvrier)\b/i.test(recherche) ? "fr-FR" : "en-US";
}
