import type { StatutTache } from "./types";

type Ton = "ok" | "alerte" | "erreur" | "accent" | "doux" | "plan";

// Libellé et couleur de chaque statut, tels que vus par l'utilisateur.
export const STATUTS: Record<StatutTache, { ton: Ton; libelle: string }> = {
  a_valider: { ton: "alerte", libelle: "À valider" },
  en_attente: { ton: "plan", libelle: "Planifiée" },
  en_cours: { ton: "accent", libelle: "En cours" },
  a_partager: { ton: "accent", libelle: "À partager" },
  terminee: { ton: "ok", libelle: "Publiée" },
  echouee: { ton: "erreur", libelle: "Échec" },
  annulee: { ton: "doux", libelle: "Annulée" },
};
