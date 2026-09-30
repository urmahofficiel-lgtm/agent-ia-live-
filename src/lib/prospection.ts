// Prospection : rédaction des messages et liens d'envoi. L'agent ne fait que
// PRÉPARER : c'est l'utilisateur qui relit puis envoie lui-même (e-mail,
// téléphone, WhatsApp, SMS), avant de marquer le prospect « contacté ».

export type Canal = "email" | "message";
export type Genre = "premier" | "relance";

export type BrouillonProspect = {
  genre: Genre;
  canal: Canal;
  objet: string;
  texte: string;
  redige_le?: string;
};

// Informations renvoyées par la base (prospect_a_rediger) pour l'IA.
export type ProspectARediger = {
  id: string;
  nom: string;
  entreprise: string | null;
  categorie: string | null;
  adresse: string | null;
  source: string | null;
  email: string | null;
  telephone: string | null;
  site: string | null;
  statut: string;
  genre: Genre;
  dernier_contact_at: string | null;
  dernier_message: string | null;
  contexte: string | null;
};

// Prospection B2B en France : possible si le message concerne l'activité du
// destinataire, à condition de lui offrir un moyen simple de s'opposer.
export const MENTION_DESINSCRIPTION =
  "Vous ne souhaitez plus recevoir de message de ma part ? Répondez simplement « STOP » et je ne vous recontacterai plus.";
export const MENTION_COURTE = "Répondez STOP pour ne plus être contacté.";

export const choisirCanal = (p: { email: string | null }, prefere?: Canal): Canal =>
  prefere ?? (p.email ? "email" : "message");

export function consigneMessage(p: ProspectARediger, canal: Canal): string {
  const relance = p.genre === "relance";
  return [
    relance
      ? "Rédige une RELANCE courte et polie d'un premier message de prospection resté sans réponse."
      : "Rédige un premier message de prospection B2B court, personnalisé et respectueux.",
    canal === "email"
      ? `Format : un e-mail avec un objet (60 caractères max) et un corps de ${relance ? "50" : "90"} mots maximum.`
      : `Format : un message (SMS ou WhatsApp) de ${relance ? "35" : "55"} mots maximum, sans objet.`,
    "",
    "Destinataire :",
    `- Entreprise : ${p.entreprise || p.nom}`,
    p.categorie ? `- Métier : ${p.categorie}` : "",
    p.adresse ? `- Adresse : ${p.adresse}` : "",
    p.site ? `- Site : ${p.site}` : "",
    "",
    p.contexte ? `Ce que nous proposons (fiche de notre marque) :\n${p.contexte}` : "Notre marque n'a pas encore de fiche : reste général sur l'aide proposée.",
    relance && p.dernier_message ? `\nPremier message envoyé :\n${p.dernier_message}` : "",
    "",
    "Règles :",
    "- Vouvoiement, en français, ton simple et humain, pas de formules creuses ni d'emoji.",
    "- Fais le lien concret entre notre offre et LE MÉTIER du destinataire (c'est ce qui rend le message légitime).",
    "- N'invente aucun chiffre, client, témoignage ni fait sur le destinataire.",
    "- Une seule question ou proposition claire à la fin (ex. un appel de 10 minutes).",
    "- Signe avec le nom de notre marque si on le connaît.",
    "- N'ajoute PAS de mention de désinscription : elle est ajoutée automatiquement.",
    "",
    'Réponds uniquement en JSON : {"objet": "…", "texte": "…"}' + (canal === "message" ? ' (objet vide "").' : "."),
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

// Ajoute la possibilité de s'opposer, si elle n'y est pas déjà.
export function avecDesinscription(texte: string, canal: Canal): string {
  const propre = texte.trim();
  if (/\bSTOP\b/.test(propre)) return propre;
  return `${propre}\n\n${canal === "email" ? `—\n${MENTION_DESINSCRIPTION}` : MENTION_COURTE}`;
}

// Lit la réponse de l'IA (JSON, éventuellement entouré de texte) ; à défaut,
// prend le texte brut.
export function lireMessage(reponse: string, canal: Canal, genre: Genre): BrouillonProspect {
  let objet = "";
  let texte = reponse.trim();
  const debut = reponse.indexOf("{");
  const fin = reponse.lastIndexOf("}");
  if (debut >= 0 && fin > debut) {
    try {
      const json = JSON.parse(reponse.slice(debut, fin + 1)) as { objet?: unknown; texte?: unknown };
      if (typeof json.texte === "string" && json.texte.trim()) {
        texte = json.texte;
        objet = typeof json.objet === "string" ? json.objet.trim() : "";
      }
    } catch {
      // texte brut
    }
  }
  texte = texte.replace(/^```\w*\s*|```$/g, "").trim();
  if (!texte) throw new Error("L'IA n'a pas rédigé de message. Réessayez.");
  if (canal === "email" && !objet) objet = genre === "relance" ? "Suite à mon message" : "Une idée pour votre activité";
  return { genre, canal, objet: canal === "email" ? objet.slice(0, 120) : "", texte: avecDesinscription(texte, canal) };
}

// Numéro au format international sans « + » (pour wa.me), France par défaut.
export function numeroInternational(tel: string): string | null {
  let n = tel.replace(/[^\d+]/g, "");
  if (n.startsWith("+")) n = n.slice(1);
  else if (n.startsWith("00")) n = n.slice(2);
  else if (/^0\d{9}$/.test(n)) n = `33${n.slice(1)}`;
  return /^\d{8,15}$/.test(n) ? n : null;
}

export type LienContact = { type: "email" | "whatsapp" | "sms" | "telephone"; libelle: string; href: string };

// Liens qui ouvrent l'application de l'utilisateur avec le texte prérempli :
// rien n'est envoyé tant qu'il n'a pas appuyé lui-même sur « Envoyer ».
export function liensContact(p: { email: string | null; telephone: string | null }, b: { objet: string; texte: string } | null): LienContact[] {
  const liens: LienContact[] = [];
  const texte = b?.texte ?? "";
  // Adresse issue de données publiques : on n'accepte qu'une adresse simple
  // (pas de « ? » ou « & » qui ajouteraient des destinataires cachés).
  const email = p.email?.split(/[;,]/)[0].trim();
  if (email && /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(email)) {
    const params = [b?.objet ? `subject=${encodeURIComponent(b.objet)}` : "", texte ? `body=${encodeURIComponent(texte)}` : ""].filter(Boolean).join("&");
    liens.push({ type: "email", libelle: "E-mail", href: `mailto:${email}${params ? `?${params}` : ""}` });
  }
  const tel = p.telephone?.split(/[;,]/)[0].trim();
  const intl = tel ? numeroInternational(tel) : null;
  if (tel && intl) {
    liens.push({ type: "whatsapp", libelle: "WhatsApp", href: `https://wa.me/${intl}${texte ? `?text=${encodeURIComponent(texte)}` : ""}` });
    liens.push({ type: "sms", libelle: "SMS", href: `sms:+${intl}${texte ? `?body=${encodeURIComponent(texte)}` : ""}` });
    liens.push({ type: "telephone", libelle: "Appeler", href: `tel:+${intl}` });
  }
  return liens;
}

// Contacté depuis plus de `jours` jours, sans réponse ni relance préparée.
export function estARelancer(
  p: { statut: string; dernier_contact_at: string | null; brouillon?: unknown },
  jours: number,
  maintenant = new Date(),
): boolean {
  if (!["contacte", "relance"].includes(p.statut) || !p.dernier_contact_at || p.brouillon) return false;
  return maintenant.getTime() - new Date(p.dernier_contact_at).getTime() >= jours * 86_400_000;
}

// Erreurs de la base traduites pour l'utilisateur.
export function messageErreurProspect(brut: string): string | null {
  if (/oppose/.test(brut)) return "Ce prospect a demandé à ne plus être contacté.";
  if (/limite de contacts/.test(brut)) return "Limite de contacts du jour atteinte (réglable dans Prospection). Reprenez demain.";
  if (/sans consentement|Particulier sans consentement/.test(brut)) return "Particulier sans accord préalable : démarchage interdit (RGPD).";
  if (/deja client ou a refuse/.test(brut)) return "Ce prospect est déjà client ou a refusé : pas de message à rédiger.";
  if (/prospect introuvable/.test(brut)) return "Prospect introuvable : vérifiez l'identifiant.";
  return null;
}
