// Animation d'une photo à partir d'une vidéo (motion transfer). Règles de
// validation et lecture des réponses de fal.ai : fonctions pures, testables.

export type ModeAnimation = "visage" | "corps";

export const MODELES_ANIMATION: Record<ModeAnimation, { id: string; nom: string; description: string }> = {
  visage: {
    id: "fal-ai/live-portrait",
    nom: "Visage",
    description: "Le visage de la photo reprend les expressions et mouvements de tête de la vidéo.",
  },
  corps: {
    id: "fal-ai/wan-motion",
    nom: "Corps entier",
    description: "Le personnage de la photo reproduit les gestes et la danse de la vidéo.",
  },
};

export const LIMITES = {
  photo: { types: ["image/jpeg", "image/png"], tailleMax: 10 * 1024 * 1024, coteMin: 256 },
  video: { types: ["video/mp4"], tailleMax: 50 * 1024 * 1024, dureeMin: 1, dureeMax: 30 },
  enCoursMax: 2, // générations simultanées par utilisateur
  parJour: 10, // générations par utilisateur et par jour (coût maîtrisé)
};

const mo = (octets: number) => `${Math.round(octets / 1024 / 1024)} Mo`;

export function validerPhoto(f: { type: string; taille: number; largeur?: number; hauteur?: number }) {
  if (!LIMITES.photo.types.includes(f.type)) return "La photo doit être au format JPEG ou PNG.";
  if (f.taille > LIMITES.photo.tailleMax) return `La photo dépasse ${mo(LIMITES.photo.tailleMax)}.`;
  if (f.largeur !== undefined && f.hauteur !== undefined && Math.min(f.largeur, f.hauteur) < LIMITES.photo.coteMin) {
    return `La photo est trop petite (au moins ${LIMITES.photo.coteMin} pixels de côté).`;
  }
  return null;
}

export function validerVideo(f: { type: string; taille: number; duree?: number }) {
  if (!LIMITES.video.types.includes(f.type)) return "La vidéo doit être au format MP4.";
  if (f.taille > LIMITES.video.tailleMax) return `La vidéo dépasse ${mo(LIMITES.video.tailleMax)}.`;
  if (f.duree !== undefined) {
    if (!Number.isFinite(f.duree) || f.duree < LIMITES.video.dureeMin) return "La vidéo est illisible ou trop courte.";
    if (f.duree > LIMITES.video.dureeMax) return `La vidéo dure plus de ${LIMITES.video.dureeMax} secondes : coupez-la avant de l'importer.`;
  }
  return null;
}

export type EtatFal = { statut: "en_file" | "en_cours" | "terminee" | "echouee"; position?: number };

// Réponse de GET …/requests/{id}/status.
export function lireStatutFal(json: { status?: string; queue_position?: number }): EtatFal {
  switch (json.status) {
    case "IN_QUEUE":
      return { statut: "en_file", position: json.queue_position };
    case "IN_PROGRESS":
      return { statut: "en_cours" };
    case "COMPLETED":
      return { statut: "terminee" };
    default:
      return { statut: "echouee" };
  }
}

// Messages d'erreur compréhensibles, avec la marche à suivre.
export function traduireErreurFal(statut: number, detail?: string) {
  if (statut === 401) return "Clé fal.ai invalide : vérifiez FAL_KEY dans Vercel.";
  if (statut === 402 || statut === 403) return "Crédit fal.ai épuisé : rechargez le compte fal.ai.";
  if (statut === 422) {
    return `Fichier refusé par le modèle${detail ? ` (${detail})` : ""}. Vérifiez qu'un visage ou une personne est bien visible.`;
  }
  if (statut === 429) return "Trop de demandes en même temps chez fal.ai. Réessayez dans une minute.";
  if (statut >= 500) return "Le service d'animation est momentanément indisponible. Réessayez plus tard.";
  return detail ? `Échec de l'animation : ${detail}` : `Échec de l'animation (erreur ${statut}).`;
}

// Erreurs Hugging Face (ZeroGPU) : quota du jour, espace en pause ou saturé.
export function traduireErreurHF(detail: string) {
  if (/quota/i.test(detail)) {
    return "Quota gratuit du jour épuisé chez Hugging Face (5 min de calcul par jour). Réessayez demain, ou utilisez le mode Visage, moins gourmand.";
  }
  if (/^401|^403|invalid.*token|unauthorized/i.test(detail)) return "Clé Hugging Face invalide : vérifiez HF_TOKEN dans Vercel.";
  if (/^404|sleeping|paused|building/i.test(detail)) return "Le modèle gratuit est en veille ou en redémarrage. Réessayez dans quelques minutes.";
  if (/^429|too many|queue.*full/i.test(detail)) return "Le modèle gratuit est saturé. Réessayez dans quelques minutes.";
  if (/^5\d\d/.test(detail)) return "Le modèle gratuit est momentanément indisponible. Réessayez plus tard.";
  return detail
    ? `Échec de l'animation : ${detail.replace(/^"|"$/g, "").slice(0, 200)}`
    : "Le modèle n'a pas pu animer ces fichiers. Vérifiez qu'une personne est bien visible, de face, puis réessayez.";
}
