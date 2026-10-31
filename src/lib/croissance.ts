// Mode croissance : contenu pensé pour la portée organique (vues, partages,
// enregistrements, abonnés) plutôt que pour la vente. Les réseaux montrent
// aux non-abonnés ce qui est utile, drôle ou qui fait réagir ; un post qui
// ressemble à une publicité s'arrête à la première vague (≈ 265 vues sur
// TikTok, quelques vues sur LinkedIn). Logique pure, partagée par le pilote,
// la rédaction, le montage, le contrôle qualité et la publication.

// Ligne ajoutée à la consigne d'une tâche du mode croissance : chaque étape
// (rédaction, vidéo, carrousel, publication) la reconnaît.
export const MARQUEUR_CROISSANCE = "Mode croissance :";
const MARQUEUR_SANS_PUB = "Post sans publicité";

export const estCroissance = (consigne: string | null | undefined) => Boolean(consigne?.includes(MARQUEUR_CROISSANCE));
export const estSansPub = (consigne: string | null | undefined) => Boolean(consigne?.includes(MARQUEUR_SANS_PUB));

// Piliers : 11 posts sur 14 sans publicité. `format` : carrousel (Instagram,
// TikTok en photos avec musique, LinkedIn en document) ou vidéo ; `essai` :
// Reel Instagram montré d'abord aux non-abonnés (Trial Reel), publié sur le
// profil s'il marche.
// Relevé du 31/10/2026 (Apify + statistiques) : sur TikTok, les carrousels
// font ≈ 1 150 vues contre ≈ 250 pour les vidéos montées ; chez les
// concurrents, le cas chiffré « tu le chiffres à combien ? » fait 20 000 à
// 120 000 vues. 8 posts sur 14 sont donc des carrousels.
export const PILIERS_CROISSANCE = [
  {
    id: "erreur",
    poids: 2,
    sansPub: true,
    format: "carrousel",
    essai: false,
    consigne:
      "Erreur qui coûte cher à la clientèle visée (argent, temps, client perdu) : la situation, pourquoi ça coûte, comment l'éviter.",
  },
  {
    id: "astuce",
    poids: 4,
    sansPub: true,
    format: "carrousel",
    essai: false,
    consigne:
      "Astuce de pro ou check-list à enregistrer : 4 à 6 points concrets, directement applicables par la clientèle visée.",
  },
  {
    id: "chiffrage",
    poids: 2,
    sansPub: true,
    format: "carrousel",
    essai: false,
    consigne:
      "Cas de chiffrage concret pour un seul métier de la clientèle visée (ex. salle de bain de 5 m² avec douche à l'italienne, toiture de 100 m², T3 de 65 m² en peinture) : le chantier en une ligne, puis les postes du devis ligne par ligne avec les quantités, sans aucun prix ; dernière diapo : « Tu le chiffres à combien, toi ? »",
  },
  {
    id: "pov",
    poids: 1,
    sansPub: true,
    format: "video",
    essai: true,
    consigne:
      "POV : une situation vécue, drôle ou agaçante, du quotidien de la clientèle visée (client, chantier, papiers), dans laquelle elle se reconnaît.",
  },
  {
    id: "actu",
    poids: 2,
    sansPub: true,
    format: "video",
    essai: false,
    consigne:
      "Actualité du métier expliquée simplement : ce qui change concrètement pour la clientèle visée et ce qu'elle doit faire (d'après la veille, sans chiffre inventé).",
  },
  {
    id: "demo",
    poids: 2,
    sansPub: false,
    format: "video",
    essai: false,
    consigne:
      "Démonstration : un vrai problème du quotidien de la clientèle, puis la fonctionnalité réelle de la marque qui le règle, montrée en situation.",
  },
  {
    id: "offre",
    poids: 1,
    sansPub: false,
    format: "video",
    essai: false,
    consigne: "Offre : ce que la marque propose, pour qui, et l'appel à l'action (sans promesse inventée).",
  },
] as const;

export type PilierCroissance = (typeof PILIERS_CROISSANCE)[number]["id"];

// Cycle de 14 piliers bien répartis (tourniquet pondéré « lisse »).
export const CYCLE_CROISSANCE: PilierCroissance[] = (() => {
  const total = PILIERS_CROISSANCE.reduce((s, c) => s + c.poids, 0);
  const courant = PILIERS_CROISSANCE.map(() => 0);
  const cycle: PilierCroissance[] = [];
  for (let i = 0; i < total; i++) {
    PILIERS_CROISSANCE.forEach((c, j) => (courant[j] += c.poids));
    const choisi = courant.indexOf(Math.max(...courant));
    courant[choisi] -= total;
    cycle.push(PILIERS_CROISSANCE[choisi].id);
  }
  return cycle;
})();

export const pilier = (id: string) => PILIERS_CROISSANCE.find((p) => p.id === id);

// Piliers des k sujets d'un jour : le cycle continue d'un jour à l'autre.
export function melangeCroissance(jour: string, k: number): PilierCroissance[] {
  const numero = Math.floor(Date.parse(`${jour}T00:00:00Z`) / 86_400_000);
  const n = CYCLE_CROISSANCE.length;
  const depart = (((numero * k) % n) + n) % n;
  return Array.from({ length: k }, (_, i) => CYCLE_CROISSANCE[(depart + i) % n]);
}

// Posts par jour au plus : au-delà, chaque post de plus fait baisser la
// portée des autres (LinkedIn : 105 vues par post à 2 posts par semaine, 4 à
// 16 par semaine).
export const MAX_PAR_JOUR_CROISSANCE: Record<string, number> = {
  linkedin: 1,
  instagram: 2,
  facebook: 1,
  facebook_groupe: 1,
  tiktok: 3,
};

// Réseaux où le carrousel existe (Instagram, TikTok en photos, LinkedIn en
// document PDF).
export const RESEAUX_CARROUSEL = ["instagram", "tiktok", "linkedin"];

// Ce que le pilote enregistre avec la tâche (format, Trial Reel, pilier).
export function resultatCroissance(id: string, plateforme: string) {
  const p = pilier(id);
  if (!p) return {};
  const carrousel = p.format === "carrousel" && RESEAUX_CARROUSEL.includes(plateforme);
  return {
    pilier: p.id,
    // Le carrousel remplace la vidéo : la file des vidéos l'ignore.
    ...(carrousel ? { format: "carrousel", video_etat: "carrousel" } : {}),
    ...(p.essai && plateforme === "instagram" ? { essai_reel: true } : {}),
  };
}

// Consigne d'une tâche du mode croissance : le pilier et la ligne repère.
export function consigneCroissance(id: string) {
  const p = pilier(id);
  if (!p) return "";
  return `Type de publication : ${p.consigne}\n${MARQUEUR_CROISSANCE} contenu utile d'abord. ${
    p.sansPub
      ? `${MARQUEUR_SANS_PUB} : ne nomme pas la marque et ne vante aucun produit.`
      : "La marque arrive après le problème, en une phrase concrète."
  }`;
}

// --- Mots à bannir ---------------------------------------------------------------

// Jargon d'éditeur de logiciel : personne ne le cherche, personne ne le
// partage (« chiffrement AES-256 », « webhooks ERP »…).
export const JARGON = [
  "aes",
  "aes-256",
  "chiffrement",
  "webhook",
  "webhooks",
  "erp",
  "api",
  "open banking",
  "multi-siret",
  "supabase",
  "francfort",
  "pwa",
  "saas",
  "cloud",
  "audit log",
  "factur-x",
  "json",
  "back-office",
  "workflow",
];

const sansAccents = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function jargonDans(texte: string): string[] {
  const t = ` ${sansAccents(texte).replace(/[^a-z0-9-]+/g, " ")} `;
  return JARGON.filter((m) => t.includes(` ${m} `));
}

// Promesses qu'on ne peut pas tenir (juridiques, absolues) : la publication
// attend une relecture.
const PROMESSES: [RegExp, string][] = [
  [/100\s?%\s*(conforme|s[ée]curis|fiable|garanti)/i, "promesse « 100 % »"],
  [/conformit[ée]\s+(garantie|totale|assur[ée]e)/i, "conformité garantie"],
  [/(confidentialit[ée]|s[ée]curit[ée])\s+totale/i, "sécurité totale"],
  [/z[ée]ro\s+(erreur|risque|oubli|litige)/i, "promesse « zéro »"],
  [/sans\s+(aucun\s+)?risque/i, "« sans risque »"],
  [/r[ée]sultats?\s+garantis?/i, "résultat garanti"],
];

export function promessesDans(texte: string): string[] {
  return PROMESSES.filter(([re]) => re.test(texte)).map(([, nom]) => nom);
}

// --- Rédaction -------------------------------------------------------------------

// Règles de rédaction du mode croissance (en plus des règles du réseau).
export function reglesCroissance(plateforme: string | null | undefined, sansPub: boolean) {
  const engagement: Record<string, string> = {
    instagram: "demande d'enregistrer le post pour plus tard, ou de l'envoyer à un collègue ou associé concerné",
    tiktok: "pose une question courte qui donne envie de répondre en commentaire (ou propose une partie 2)",
    linkedin: "pose une question ouverte à laquelle un professionnel a envie de répondre en commentaire",
    facebook: "pose une question simple qui donne envie de commenter",
  };
  return [
    "Règles du mode croissance (prioritaires) :",
    "- Le post est fait pour être partagé et enregistré par la clientèle visée : apporte d'abord une info utile, une situation vécue ou une question qui fait réagir.",
    sansPub
      ? "- Post sans publicité : ne nomme PAS la marque, ne parle d'aucun produit ni outil, aucun appel à l'essai, aucun « lien en bio »."
      : "- La marque n'arrive qu'après le problème, en une seule phrase concrète.",
    "- Première ligne = l'accroche : reprends le titre du sujet (tu peux le rendre plus percutant), 8 mots au plus, sans nom de marque, en français correct et naturel ; un chiffre, une erreur, une question ou « POV : … », avec les mots de la clientèle.",
    `- Dernière phrase = appel à l'engagement : ${engagement[plateforme ?? ""] ?? "pose une question simple qui donne envie de commenter"}.`,
    `- Jamais de jargon technique (${JARGON.slice(0, 8).join(", ")}…) : les mots du terrain.`,
    "- Phrases courtes, une idée par ligne, emojis rares (2 au plus).",
    plateforme === "instagram" || plateforme === "facebook" || plateforme === "linkedin"
      ? "- Tout à la fin, sur une ligne à part : « Premier commentaire : » suivi d'une question courte (moins de 120 caractères) qui lance la discussion ; elle sera publiée en commentaire, pas dans le post."
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// « Premier commentaire : … » écrit à la fin du post : retiré du texte et
// publié en commentaire juste après.
const LIGNE_COMMENTAIRE = /^[ \t]*premier commentaire[ \t]*:[ \t]*(.+)$/im;

export function extrairePremierCommentaire(texte: string): { texte: string; commentaire: string | null } {
  const m = texte.match(LIGNE_COMMENTAIRE);
  if (!m) return { texte, commentaire: null };
  const commentaire = m[1].replace(/^["«\s]+|["»\s]+$/g, "").trim().slice(0, 300);
  const reste = texte
    .replace(LIGNE_COMMENTAIRE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { texte: reste, commentaire: commentaire || null };
}

// --- Sujets de secours -------------------------------------------------------------

// Sujets quand l'IA ne répond pas le matin : mieux vaut un sujet utile tout
// prêt qu'une journée sans publication. Les sujets de la veille du jour
// passent d'abord.
const BANQUE: { titre: string; pilier: PilierCroissance; consigne: string }[] = [
  { titre: "3 erreurs qui font perdre un client au premier rendez-vous", pilier: "erreur", consigne: "Les erreurs les plus courantes au premier contact avec un client, et ce qu'il faut faire à la place." },
  { titre: "La check-list avant d'envoyer un devis", pilier: "astuce", consigne: "Les points à vérifier avant d'envoyer un devis pour ne pas perdre de marge ni de temps." },
  { titre: "POV : le client qui veut un prix au téléphone", pilier: "pov", consigne: "La scène qu'on vit tous, et la bonne réponse à donner sans se brader." },
  { titre: "Salle de bain de 5 m² : tu la chiffres à combien ?", pilier: "chiffrage", consigne: "Douche à l'italienne, faïence, WC suspendu : les postes du devis ligne par ligne, sans prix, puis la question en commentaire." },
  { titre: "Comment relancer un client qui ne répond plus", pilier: "astuce", consigne: "Une méthode simple de relance, en 3 messages, sans paraître insistant." },
  { titre: "L'erreur qui fait exploser les impayés", pilier: "erreur", consigne: "Ce qui laisse traîner les paiements et les réflexes qui font payer à l'heure." },
  { titre: "POV : la fin de journée passée à faire les papiers", pilier: "pov", consigne: "Le soir au bureau après le chantier, et comment s'en sortir plus vite." },
  { titre: "5 réflexes pour protéger sa marge", pilier: "astuce", consigne: "Les réflexes simples qui évitent de travailler à perte." },
];

// Sujets de la veille : lignes « - Titre → angle : … (source : …) ».
export function sujetsDeLaVeille(tendances: string | null | undefined) {
  return (tendances ?? "")
    .split("\n")
    .map((l) => l.match(/^-\s*(.+?)(?:\s*→\s*angle\s*:\s*(.+?))?(?:\s*\(source\s*:.*\))?\s*$/))
    .filter((m): m is RegExpMatchArray => Boolean(m?.[1]))
    .map((m) => ({ titre: m[1].trim().slice(0, 120), consigne: (m[2] ?? m[1]).trim() }));
}

const cle = (s: string) => sansAccents(s).replace(/[^a-z0-9]+/g, "");

export function sujetsDeSecours(k: number, tendances: string | null | undefined, titresRecents: string[], jour: string) {
  const vus = new Set(titresRecents.map(cle));
  const numero = Math.floor(Date.parse(`${jour}T00:00:00Z`) / 86_400_000);
  const tournee = BANQUE.map((_, i) => BANQUE[(i + numero) % BANQUE.length]);
  const candidats = [...sujetsDeLaVeille(tendances), ...tournee.map((b) => ({ titre: b.titre, consigne: b.consigne }))];
  const sujets: { titre: string; consigne: string }[] = [];
  for (const s of candidats) {
    if (sujets.length >= k) break;
    if (vus.has(cle(s.titre))) continue;
    vus.add(cle(s.titre));
    sujets.push(s);
  }
  return sujets;
}
