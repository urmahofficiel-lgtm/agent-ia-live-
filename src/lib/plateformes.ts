// Plateformes que l'agent saura piloter. `zernio` = identifiant chez Zernio,
// le service qui gère l'autorisation et la publication ; `null` = pas encore
// branché (e-mail, Messenger…), l'agent passera par un autre chemin.
export type Plateforme = {
  id: string;
  nom: string;
  categorie: "reseau" | "messagerie" | "email" | "local";
  zernio: string | null;
  // Aucune API ne permet de publier : l'agent prépare, l'utilisateur partage
  // en 1 clic depuis son téléphone.
  manuel?: boolean;
};

export const PLATEFORMES: Plateforme[] = [
  { id: "facebook", nom: "Facebook", categorie: "reseau", zernio: "facebook" },
  { id: "facebook_profil", nom: "Facebook perso", categorie: "reseau", zernio: null, manuel: true },
  // Posts écrits pour les groupes Facebook, partagés par l'utilisateur.
  { id: "facebook_groupe", nom: "Groupes Facebook", categorie: "reseau", zernio: null, manuel: true },
  { id: "instagram", nom: "Instagram", categorie: "reseau", zernio: "instagram" },
  { id: "linkedin", nom: "LinkedIn", categorie: "reseau", zernio: "linkedin" },
  { id: "tiktok", nom: "TikTok", categorie: "reseau", zernio: "tiktok" },
  { id: "x", nom: "X (Twitter)", categorie: "reseau", zernio: "twitter" },
  { id: "youtube", nom: "YouTube", categorie: "reseau", zernio: "youtube" },
  { id: "google_business", nom: "Google Business", categorie: "local", zernio: "googlebusiness" },
  { id: "threads", nom: "Threads", categorie: "reseau", zernio: "threads" },
  { id: "pinterest", nom: "Pinterest", categorie: "reseau", zernio: "pinterest" },
  { id: "bluesky", nom: "Bluesky", categorie: "reseau", zernio: "bluesky" },
  { id: "reddit", nom: "Reddit", categorie: "reseau", zernio: "reddit" },
  { id: "snapchat", nom: "Snapchat", categorie: "reseau", zernio: "snapchat" },
  { id: "whatsapp_business", nom: "WhatsApp", categorie: "messagerie", zernio: "whatsapp" },
  { id: "telegram", nom: "Telegram", categorie: "messagerie", zernio: "telegram" },
  { id: "messenger", nom: "Messenger", categorie: "messagerie", zernio: null },
  { id: "gmail", nom: "Gmail", categorie: "email", zernio: null },
  { id: "outlook", nom: "Outlook", categorie: "email", zernio: null },
];

export const nomPlateforme = (id: string | null | undefined) =>
  PLATEFORMES.find((p) => p.id === id)?.nom ?? id ?? "—";

export const estManuel = (id: string | null | undefined) => Boolean(PLATEFORMES.find((p) => p.id === id)?.manuel);

export const plateformeParZernio = (zernio: string) => PLATEFORMES.find((p) => p.zernio === zernio);
