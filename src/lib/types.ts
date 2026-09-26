export type StatutTache = "en_attente" | "a_valider" | "en_cours" | "terminee" | "echouee" | "annulee";
export type TypeTache = "publication" | "reponse" | "prospection" | "relance" | "appareil" | "autre";

export type Tache = {
  id: string;
  type: TypeTache;
  plateforme: string | null;
  titre: string;
  consigne: string;
  statut: StatutTache;
  planifiee_pour: string | null;
  created_at: string;
};

export type Evenement = {
  id: number;
  tache_id: string | null;
  niveau: "info" | "action" | "erreur";
  message: string;
  created_at: string;
};

export type Prospect = {
  id: string;
  type: "entreprise" | "particulier";
  nom: string;
  entreprise: string | null;
  email: string | null;
  telephone: string | null;
  source: string | null;
  statut: string;
  consentement: boolean;
  created_at: string;
};

export type Reglages = {
  agent_actif: boolean;
  validation_requise: boolean;
  mode: "prudent" | "agressif";
  limite_contacts_jour: number;
};

export const LIBELLE_STATUT: Record<StatutTache, string> = {
  en_attente: "En attente",
  a_valider: "À valider",
  en_cours: "En cours",
  terminee: "Terminée",
  echouee: "Échouée",
  annulee: "Annulée",
};

export const LIBELLE_TYPE: Record<TypeTache, string> = {
  publication: "Publication",
  reponse: "Réponse (commentaires / messages)",
  prospection: "Prospection",
  relance: "Relance",
  appareil: "Action sur l'appareil",
  autre: "Autre",
};
