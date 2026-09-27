import { choisirVideo, langueRecherche, lienPhoto, type PhotoPexels, type VideoPexels } from "./pexels";

const BASE = "https://api.pexels.com";
const TAILLE_MAX = 30_000_000;

export const pexelsConfigure = () => Boolean(process.env.PEXELS_API_KEY);

async function appel<T>(chemin: string): Promise<T | null> {
  const cle = process.env.PEXELS_API_KEY;
  if (!cle) return null;
  const r = await fetch(BASE + chemin, { headers: { Authorization: cle }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) {
    console.warn("Pexels", chemin, r.status);
    return null;
  }
  return (await r.json()) as T;
}

async function telecharger(url: string) {
  const r = await fetch(url, { signal: AbortSignal.timeout(45_000) });
  if (!r.ok) return null;
  const taille = Number(r.headers.get("content-length") ?? 0);
  if (taille > TAILLE_MAX) return null;
  const b = Buffer.from(await r.arrayBuffer());
  return b.length > TAILLE_MAX ? null : b;
}

// Séquence vidéo verticale réelle pour une scène (ou null si rien d'adapté).
// `dejaVus` : identifiants déjà utilisés dans la vidéo (mis à jour ici), pour
// ne jamais montrer deux fois la même séquence.
export async function sequenceVerticale(recherche: string, duree: number, dejaVus: Set<number> = new Set()): Promise<Buffer | null> {
  if (!recherche) return null;
  const q = new URLSearchParams({ query: recherche, orientation: "portrait", size: "medium", per_page: "15", locale: langueRecherche(recherche) });
  const r = await appel<{ videos: VideoPexels[] }>(`/videos/search?${q}`);
  const choix = r ? choisirVideo(r.videos ?? [], duree, dejaVus) : null;
  if (!choix) return null;
  dejaVus.add(choix.id);
  return telecharger(choix.fichier.link);
}

// Photo réelle (secours quand la génération d'image IA échoue).
export async function photo(
  recherche: string,
  orientation: "portrait" | "paysage" | "carre",
  dejaVus: Set<number> = new Set(),
): Promise<Buffer | null> {
  if (!recherche) return null;
  const q = new URLSearchParams({
    query: recherche,
    orientation: orientation === "paysage" ? "landscape" : orientation === "carre" ? "square" : "portrait",
    per_page: "10",
    locale: langueRecherche(recherche),
  });
  const r = await appel<{ photos: PhotoPexels[] }>(`/v1/search?${q}`);
  const p = r?.photos?.find((x) => !dejaVus.has(x.id));
  if (!p) return null;
  dejaVus.add(p.id);
  return telecharger(lienPhoto(p, orientation));
}
