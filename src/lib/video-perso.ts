import { instantParis, jourParis, minutesParis } from "./pilote";

// Vidéo toute faite apportée par l'utilisateur (Google Flow, téléphone…) : elle
// est publiée telle quelle à la place d'une vidéo créée par l'agent, qui n'écrit
// que le texte qui l'accompagne.

// Limites du stockage « videos » (voir la migration des vidéos).
export const TAILLE_MAX_VIDEO = 50 * 1024 * 1024;

export function verifierVideo(f: { type: string; size: number }): string | null {
  if (f.type !== "video/mp4") return "Vidéo au format MP4 uniquement (les .mov et .webm ne sont pas acceptés par les réseaux).";
  if (f.size > TAILLE_MAX_VIDEO) return "Vidéo trop lourde : 50 Mo au maximum.";
  if (f.size < 10_000) return "Ce fichier est vide ou illisible.";
  return null;
}

// Nom de fichier sans accents ni espaces, rangé dans le dossier de l'utilisateur
// (seul endroit où le stockage l'autorise à écrire).
export function cheminVideo(userId: string, nom: string, maintenant = Date.now()) {
  const propre =
    nom
      .replace(/\.[^.]+$/, "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50) || "video";
  return `${userId}/perso-${maintenant}-${propre}.mp4`;
}

// Consigne donnée à l'agent pour écrire la légende : la vidéo existe déjà.
export function consigneVideoPerso(consigne: string) {
  const regle =
    "Une vidéo toute faite est jointe (avec sa voix) : écris seulement la légende qui l'accompagne, sans décrire de scène ni parler de la vidéo elle-même.";
  return consigne.trim() ? `${regle}\n${consigne.trim()}` : regle;
}

// Ce que la publication garde de la vidéo : elle est « prête », l'agent n'en crée pas d'autre.
export const resultatVideoPerso = (url: string) => ({ video_url: url, video_etat: "prete" as const, video_perso: true });

// Meilleur moment pour publier d'après les statistiques de l'agent : le soir
// (18 h – 22 h), surtout le week-end. Les prochains soirs à 18 h 30, heure de Paris.
export const HEURE_CONSEILLEE = "18:30";

export function creneauxConseilles(maintenant = new Date(), nombre = 4) {
  const sortie: { libelle: string; instant: Date }[] = [];
  const aujourdhui = jourParis(maintenant);
  for (let i = 0; i < 14 && sortie.length < nombre; i++) {
    const jour = jourParis(new Date(instantParis(aujourdhui, "12:00").getTime() + i * 86_400_000));
    const instant = instantParis(jour, HEURE_CONSEILLEE);
    // Pas un créneau déjà passé ou dans moins de 15 minutes.
    if (instant.getTime() < maintenant.getTime() + 15 * 60_000) continue;
    const jourLisible = instant.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });
    const libelle = i === 0 && minutesParis(maintenant) < 18 * 60 + 15 ? "Ce soir, 18 h 30" : `${jourLisible}, 18 h 30`;
    sortie.push({ libelle, instant });
  }
  return sortie;
}

// Valeur d'un champ « datetime-local » (heure de Paris, sans fuseau) pour un instant.
export function valeurChampDate(instant: Date) {
  const jour = jourParis(instant);
  const m = minutesParis(instant);
  return `${jour}T${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
