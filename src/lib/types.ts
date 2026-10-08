import type { BrouillonProspect } from "./prospection";
import type { Stats } from "./statistiques";

export type StatutTache =
  | "en_attente"
  | "a_valider"
  | "en_cours"
  | "a_partager"
  | "terminee"
  | "echouee"
  | "annulee";
export type TypeTache =
  "publication" | "reponse" | "prospection" | "relance" | "appareil" | "autre";

export type Tache = {
  id: string;
  type: TypeTache;
  plateforme: string | null;
  titre: string;
  consigne: string;
  statut: StatutTache;
  planifiee_pour: string | null;
  resultat: {
    brouillon?: string;
    visuel_url?: string;
    video_url?: string;
    video_etat?: "en_cours" | "prete" | "echec";
    video_erreur?: string | null;
    video_debut?: string;
    video_style?: string;
    visuel_style?: string;
    post_id?: string;
    publie_le?: string;
    // Relu toutes les heures (/api/agent/stats).
    stats?: Partial<Stats>;
  } | null;
  created_at: string;
};

export type Evenement = {
  id: number;
  tache_id: string | null;
  niveau: "info" | "action" | "erreur";
  message: string;
  capture_url: string | null;
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
  site: string | null;
  statut: string;
  consentement: boolean;
  notes: string | null;
  categorie: string | null;
  adresse: string | null;
  // Fiche de l'annuaire officiel des entreprises (SIRET, ancienneté, taille, RGE).
  siret?: string | null;
  infos?: string | null;
  // Recherche automatique du téléphone : date et page où il a été trouvé.
  coordonnees_cherchees_at?: string | null;
  coordonnees_source?: string | null;
  // Adresse e-mail en erreur (rebond) : plus d'envoi.
  email_invalide?: boolean;
  // Code pays (FR, BE…).
  pays?: string;
  // Message rédigé par l'IA, à relire et envoyer soi-même.
  brouillon: BrouillonProspect | null;
  dernier_contact_at: string | null;
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
  a_partager: "À partager",
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
