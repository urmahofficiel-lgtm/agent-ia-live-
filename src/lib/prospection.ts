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
  infos?: string | null;
  statut: string;
  genre: Genre;
  dernier_contact_at: string | null;
  dernier_message: string | null;
  contexte: string | null;
  // Code pays (FR par défaut).
  pays?: string | null;
};

// Prospection B2B en France : possible si le message concerne l'activité du
// destinataire, à condition de lui offrir un moyen simple de s'opposer.
export const MENTION_DESINSCRIPTION =
  "Vous ne souhaitez plus recevoir de message de ma part ? Répondez simplement « STOP » et je ne vous recontacterai plus.";
export const MENTION_COURTE = "Répondez STOP pour ne plus être contacté.";

export const choisirCanal = (
  p: { email: string | null },
  prefere?: Canal,
): Canal => prefere ?? (p.email ? "email" : "message");

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
    p.infos
      ? `- Fiche officielle : ${p.infos.replace(/SIRET [\d ]+( · )?/, "")}`
      : "",
    "",
    p.contexte
      ? `Ce que nous proposons (fiche de notre marque) :\n${p.contexte}`
      : "Notre marque n'a pas encore de fiche : reste général sur l'aide proposée.",
    relance && p.dernier_message
      ? `\nPremier message envoyé :\n${p.dernier_message}`
      : "",
    "",
    "Règles :",
    "- Vouvoiement, en français, ton simple et humain, pas de formules creuses ni d'emoji.",
    "- Fais le lien concret entre notre offre et LE MÉTIER du destinataire (c'est ce qui rend le message légitime).",
    "- N'invente aucun chiffre, client, témoignage ni fait sur le destinataire.",
    ...(p.pays && p.pays !== "FR"
      ? [
          "- Destinataire hors de France (" + p.pays + ") : ne parle ni de Factur-X ni d'obligations ou de lois françaises ; reste sur la collaboration et le gain de temps.",
        ]
      : []),
    ...(/architect|ma[iî]tre d.[œo]uvre|bureau d.[ée]tudes?/i.test(p.categorie ?? "")
      ? [
          "- Destinataire = architecte / maître d'œuvre : ne vends pas un outil de devis. Parle de COLLABORATION : tous les corps d'état travaillent au même endroit sur le même chantier (planning, réserves sur plans, comptes rendus de réunion par IA, suivi de chantier partagé).",
          "- Dis honnêtement que BTP Ecosystem est un produit récent et que nous cherchons quelques architectes pour l'essayer sur de vrais chantiers et nous dire ce qui manque. Offre pilote confirmée par le fondateur : la formule Business est offerte pendant 3 mois aux architectes qui l'essaient sur de vrais chantiers et nous donnent leurs retours — mentionne-la clairement, sans autre promesse ni remise. Propose un échange de 15 minutes.",
        ]
      : []),
    "- Si la fiche officielle indique « certifiée RGE », mentionne-le en une demi-phrase (fait officiel) et relie l'offre aux chantiers de rénovation énergétique ; sinon, ne parle pas de RGE.",
    "- Une seule question ou proposition claire à la fin (ex. un appel de 10 minutes).",
    canal === "email"
      ? "- Ne signe pas et ne mets ni site ni coordonnées : la signature est ajoutée automatiquement sous l'e-mail."
      : "- Signe avec le nom de notre marque si on le connaît.",
    "- N'ajoute PAS de mention de désinscription : elle est ajoutée automatiquement.",
    "",
    'Réponds uniquement en JSON : {"objet": "…", "texte": "…"}' +
      (canal === "message" ? ' (objet vide "").' : "."),
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
export function lireMessage(
  reponse: string,
  canal: Canal,
  genre: Genre,
): BrouillonProspect {
  let objet = "";
  let texte = reponse.trim();
  const debut = reponse.indexOf("{");
  const fin = reponse.lastIndexOf("}");
  if (debut >= 0 && fin > debut) {
    try {
      const json = JSON.parse(reponse.slice(debut, fin + 1)) as {
        objet?: unknown;
        texte?: unknown;
      };
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
  if (canal === "email" && !objet)
    objet =
      genre === "relance"
        ? "Suite à mon message"
        : "Une idée pour votre activité";
  return {
    genre,
    canal,
    objet: canal === "email" ? objet.slice(0, 120) : "",
    texte: avecDesinscription(texte, canal),
  };
}

// Numéro au format international sans « + » (pour wa.me), France par défaut.
export function numeroInternational(tel: string): string | null {
  let n = tel.replace(/[^\d+]/g, "");
  if (n.startsWith("+")) n = n.slice(1);
  else if (n.startsWith("00")) n = n.slice(2);
  else if (/^0\d{9}$/.test(n)) n = `33${n.slice(1)}`;
  return /^\d{8,15}$/.test(n) ? n : null;
}

export type LienContact = {
  type: "email" | "whatsapp" | "sms" | "telephone";
  libelle: string;
  href: string;
};

// Liens qui ouvrent l'application de l'utilisateur avec le texte prérempli :
// rien n'est envoyé tant qu'il n'a pas appuyé lui-même sur « Envoyer ».
export function liensContact(
  p: { email: string | null; telephone: string | null },
  b: { objet: string; texte: string } | null,
): LienContact[] {
  const liens: LienContact[] = [];
  const texte = b?.texte ?? "";
  // Adresse issue de données publiques : on n'accepte qu'une adresse simple
  // (pas de « ? » ou « & » qui ajouteraient des destinataires cachés).
  const email = p.email?.split(/[;,]/)[0].trim();
  if (email && /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(email)) {
    const params = [
      b?.objet ? `subject=${encodeURIComponent(b.objet)}` : "",
      texte ? `body=${encodeURIComponent(texte)}` : "",
    ]
      .filter(Boolean)
      .join("&");
    liens.push({
      type: "email",
      libelle: "E-mail",
      href: `mailto:${email}${params ? `?${params}` : ""}`,
    });
  }
  const tel = p.telephone?.split(/[;,]/)[0].trim();
  const intl = tel ? numeroInternational(tel) : null;
  if (tel && intl) {
    liens.push({
      type: "whatsapp",
      libelle: "WhatsApp",
      href: `https://wa.me/${intl}${texte ? `?text=${encodeURIComponent(texte)}` : ""}`,
    });
    liens.push({
      type: "sms",
      libelle: "SMS",
      href: `sms:+${intl}${texte ? `?body=${encodeURIComponent(texte)}` : ""}`,
    });
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
  if (
    !["contacte", "relance"].includes(p.statut) ||
    !p.dernier_contact_at ||
    p.brouillon
  )
    return false;
  return (
    maintenant.getTime() - new Date(p.dernier_contact_at).getTime() >=
    jours * 86_400_000
  );
}

// Erreurs de la base traduites pour l'utilisateur.
export function messageErreurProspect(brut: string): string | null {
  if (/oppose/.test(brut))
    return "Ce prospect a demandé à ne plus être contacté.";
  if (/limite de contacts/.test(brut))
    return "Limite de contacts du jour atteinte (réglable dans Prospection). Reprenez demain.";
  if (/sans consentement|Particulier sans consentement/.test(brut))
    return "Particulier sans accord préalable : démarchage interdit (RGPD).";
  if (/deja client ou a refuse/.test(brut))
    return "Ce prospect est déjà client ou a refusé : pas de message à rédiger.";
  if (/adresse e-mail invalide/.test(brut))
    return "Adresse e-mail invalide ou en erreur : envoi impossible.";
  if (/expedition non configuree/.test(brut))
    return "Choisissez d'abord l'adresse d'expédition (Prospection → Agent e-mail).";
  if (/prospect introuvable/.test(brut))
    return "Prospect introuvable : vérifiez l'identifiant.";
  return null;
}

// Suivi d'une campagne e-mail (métier visé, ou tous) : où en est chaque
// prospect. Même règle que le moteur : le métier est cherché dans la catégorie.
export type BilanCampagne = {
  aContacter: number;
  contactes: number;
  relances: number;
  ontRepondu: number;
  sansEmail: number;
  enErreur: number;
};
export function bilanCampagne(
  prospects: {
    type: string;
    statut: string;
    email: string | null;
    email_invalide?: boolean | null;
    categorie: string | null;
  }[],
  cible: string | null,
): BilanCampagne {
  const vise = cible?.trim().toLowerCase() ?? "";
  const b: BilanCampagne = { aContacter: 0, contactes: 0, relances: 0, ontRepondu: 0, sansEmail: 0, enErreur: 0 };
  for (const p of prospects) {
    if (p.type !== "entreprise") continue;
    if (vise && !(p.categorie ?? "").toLowerCase().includes(vise)) continue;
    if (p.statut === "contacte") b.contactes++;
    else if (p.statut === "relance") b.relances++;
    else if (p.statut === "a_repondu" || p.statut === "client") b.ontRepondu++;
    else if (p.statut === "nouveau") {
      if (!p.email?.trim()) b.sansEmail++;
      else if (p.email_invalide) b.enErreur++;
      else b.aContacter++;
    }
  }
  return b;
}

// À appeler : entreprise jamais contactée, qui a un téléphone mais pas
// d'e-mail (l'agent e-mail ne peut pas la joindre).
export function estAAppeler(p: {
  type: string;
  statut: string;
  telephone: string | null;
  email: string | null;
}): boolean {
  return (
    p.type === "entreprise" &&
    p.statut === "nouveau" &&
    Boolean(p.telephone?.trim()) &&
    !p.email?.trim()
  );
}

// Trame d'appel courte : se présenter, le bénéfice pour SON métier, une seule
// demande (l'adresse e-mail pour envoyer la présentation).
export function scriptAppel(marque: string | null, metier: string | null): string[] {
  const nom = marque?.trim() || "notre entreprise";
  const pourArchitecte = /architect|ma[iî]tre d.[œo]uvre/i.test(metier ?? "");
  return [
    `Bonjour, [votre prénom], de ${nom}. Je ne vous prends qu'une minute.`,
    pourArchitecte
      ? `${nom} réunit tous les corps de métier d'un chantier au même endroit : planning, réserves sur plans, comptes rendus de réunion.`
      : `Je vous appelle parce que ${nom} aide les entreprises comme la vôtre à gagner du temps sur leurs chantiers.`,
    // Offre pilote propre à BTP Ecosystem (confirmée par son fondateur).
    pourArchitecte && /btp[\s-]?ecosystem/i.test(nom)
      ? "Nous cherchons quelques architectes pour l'essayer sur de vrais chantiers, et nous offrons la formule Business pendant 3 mois en échange de leurs retours."
      : "Nous proposons de l'essayer, pour voir si c'est utile pour vous.",
    "Est-ce que je peux vous envoyer la présentation par e-mail ? À quelle adresse ?",
    "S'il refuse : « Très bien, merci, je ne vous rappellerai pas. » (puis statut « Refus » ou « Ne plus contacter »).",
  ];
}

// Adresse e-mail impersonnelle (boîte d'entreprise, pas une personne) :
// seule autorisée sans accord préalable en Belgique. Même liste que la base
// (prive.email_impersonnel).
export const PREFIXES_IMPERSONNELS = [
  "contact", "info", "infos", "bureau", "secretariat", "secretaria", "agence", "office",
  "accueil", "admin", "administration", "hello", "bonjour", "mail", "studio", "atelier",
  "projets", "projet", "direction", "reception", "team", "equipe", "general", "courrier",
  "archi", "arch", "architecte", "architectes", "architecture", "cabinet",
];
export function emailImpersonnel(email: string | null | undefined): boolean {
  const [local = "", domaine = ""] = (email ?? "").trim().toLowerCase().split("@");
  if (!local) return false;
  const racine = local.split(/[.\-_+]/)[0];
  // Adresse au nom du cabinet (« a2rc@a2rc.be ») : boîte de l'entreprise.
  return PREFIXES_IMPERSONNELS.includes(racine) || local === domaine.split(".")[0];
}
