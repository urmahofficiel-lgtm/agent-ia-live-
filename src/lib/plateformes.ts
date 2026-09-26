// Plateformes que l'agent saura piloter. `api` = accès officiel disponible
// (mode prudent) ; sinon l'agent passera par le contrôle de l'écran.
export type Plateforme = {
  id: string;
  nom: string;
  categorie: "reseau" | "messagerie" | "email" | "local";
  api: boolean;
};

export const PLATEFORMES: Plateforme[] = [
  { id: "facebook", nom: "Facebook", categorie: "reseau", api: true },
  { id: "instagram", nom: "Instagram", categorie: "reseau", api: true },
  { id: "linkedin", nom: "LinkedIn", categorie: "reseau", api: true },
  { id: "tiktok", nom: "TikTok", categorie: "reseau", api: true },
  { id: "x", nom: "X (Twitter)", categorie: "reseau", api: true },
  { id: "youtube", nom: "YouTube", categorie: "reseau", api: true },
  { id: "google_business", nom: "Google Business Profile", categorie: "local", api: true },
  { id: "threads", nom: "Threads", categorie: "reseau", api: true },
  { id: "pinterest", nom: "Pinterest", categorie: "reseau", api: true },
  { id: "bluesky", nom: "Bluesky", categorie: "reseau", api: true },
  { id: "reddit", nom: "Reddit", categorie: "reseau", api: true },
  { id: "snapchat", nom: "Snapchat", categorie: "reseau", api: false },
  { id: "whatsapp_business", nom: "WhatsApp Business", categorie: "messagerie", api: true },
  { id: "telegram", nom: "Telegram", categorie: "messagerie", api: true },
  { id: "messenger", nom: "Messenger", categorie: "messagerie", api: true },
  { id: "gmail", nom: "Gmail", categorie: "email", api: true },
  { id: "outlook", nom: "Outlook", categorie: "email", api: true },
];

export const nomPlateforme = (id: string | null | undefined) =>
  PLATEFORMES.find((p) => p.id === id)?.nom ?? id ?? "—";
