import { MARCHE_DEFAUT, type Canal } from "./marches";
import { REGLES_PILOTE, heuresDuJour, instantParis, postsParJour } from "./pilote";

// Série « Une journée de… » : chaque jour, une vidéo d'environ 30 secondes
// qui raconte la journée type d'un métier (plombier, architecte, expert-
// comptable…) heure par heure, du réveil à 5 h jusqu'au devis du soir, et
// finit par la solution de la marque. Essai d'une semaine : le pilote
// automatique ajoute un épisode par jour sur TikTok, Instagram et Facebook,
// puis s'arrête tout seul. Un métier et un angle différents chaque jour.
// Logique pure, testable.

export const SERIE_JOURNEE = {
  debut: "2026-10-13",
  fin: "2026-10-19",
  reseaux: ["tiktok", "instagram", "facebook"] as readonly string[],
};

// Ligne qui marque la consigne d'un épisode : le moteur y reconnaît le style
// vidéo « journée », quel que soit le réglage par défaut.
export const MARQUE_JOURNEE = "Format vidéo : une journée type, heure par heure.";

export const estJournee = (consigne: string | null | undefined) => Boolean(consigne?.includes(MARQUE_JOURNEE));

export const serieActive = (jour: string) => jour >= SERIE_JOURNEE.debut && jour <= SERIE_JOURNEE.fin;

// Métiers de la série, dans l'ordre des épisodes : un artisan, l'architecte,
// l'expert-comptable, puis d'autres artisans. `decor` : mots-clés (en anglais)
// pour trouver les séquences filmées de leur vrai quotidien.
type Metier = { id: string; nom: string; metier: string; decor: string };

export const METIERS_JOURNEE: Metier[] = [
  { id: "plombier", nom: "plombier", metier: "plombier-chauffagiste artisan, souvent seul ou avec un apprenti", decor: "plumber, copper pipes, boiler, work van, toolbox, leaking pipe" },
  { id: "architecte", nom: "architecte", metier: "architecte indépendant : plans, permis de construire, visites de chantier, clients et entreprises à coordonner", decor: "architect desk, building plans, drawing tablet, site visit hard hat, scale model" },
  { id: "comptable", nom: "expert-comptable", metier: "expert-comptable en cabinet : bilans, TVA, pièces manquantes des clients, échéances fiscales", decor: "accountant desk, calculator, invoices, laptop spreadsheet, office at night" },
  { id: "electricien", nom: "électricien", metier: "électricien artisan : installations, dépannages, mises aux normes", decor: "electrician, electrical panel, wiring, work van, multimeter" },
  { id: "macon", nom: "maçon", metier: "maçon artisan : gros œuvre, dalles, murs, extérieurs, météo capricieuse", decor: "bricklayer, concrete pouring, brick wall, construction site, cement mixer" },
  { id: "couvreur", nom: "couvreur", metier: "couvreur artisan : toitures, tuiles, zinguerie, travail en hauteur", decor: "roofer, roof tiles, scaffolding, roof repair, ladder" },
  { id: "peintre", nom: "peintre en bâtiment", metier: "peintre en bâtiment artisan : rénovation, finitions, devis de particuliers", decor: "house painter, paint roller, wall painting, plastering, paint cans" },
  { id: "carreleur", nom: "carreleur", metier: "carreleur artisan : salles de bain, sols, finitions au millimètre", decor: "tiler, floor tiles, tile cutter, bathroom renovation, grout" },
  { id: "menuisier", nom: "menuisier", metier: "menuisier artisan : fenêtres, escaliers, agencements sur mesure", decor: "carpenter, wood workshop, window installation, wooden stairs, saw" },
];

// Angles des épisodes : le fil de la journée change d'un jour à l'autre.
// Chaque angle propose des moments concrets, que l'IA adapte au métier.
type Angle = { id: string; nom: string; details: string };

export const ANGLES_JOURNEE: Angle[] = [
  {
    id: "reveil",
    nom: "le réveil à 5 h et la route",
    details:
      "le réveil à 5 heures, le café avalé debout, la route dans le noir, le plein de carburant qui coûte cher (le gazole dépasse 2 € le litre en France début octobre 2026, à citer seulement si le métier prend la route), le premier rendez-vous avant 7 heures",
  },
  {
    id: "imprevus",
    nom: "les imprévus",
    details:
      "le client qui change d'avis à la dernière minute, la livraison en retard, le café offert qui fait du bien, la fierté du travail terminé",
  },
  {
    id: "paperasse",
    nom: "la paperasse",
    details:
      "les factures à envoyer, les relances de paiement, la TVA, la pièce introuvable, le week-end qui passe à rattraper l'administratif",
  },
  {
    id: "devis",
    nom: "le devis du soir",
    details:
      "le dîner à 21 heures, le devis à finir sur la table de la cuisine, le client qui attend sa réponse, les mesures à reprendre",
  },
  {
    id: "corps",
    nom: "le corps et la tête",
    details:
      "le dos, les genoux (pour un métier de bureau : les yeux, la nuque), la charge mentale, la liste de choses à ne pas oublier qui tourne dans la tête au lit",
  },
  {
    id: "appels",
    nom: "les appels manqués",
    details:
      "le téléphone qui sonne pendant que les deux mains sont occupées, les messages qui s'empilent, le client qui rappelle trop tard et qui est déjà parti chez un autre",
  },
  {
    id: "reputation",
    nom: "la réputation",
    details:
      "les avis Google qu'on n'ose pas demander, le bouche-à-oreille qui ne suffit plus, le nouveau client qui ne sait pas qui appeler",
  },
];

// « de plombier », « d'architecte ».
const deNom = (nom: string) => (/^[aeiouyéèêàâh]/i.test(nom) ? `d'${nom}` : `de ${nom}`);

export const titreJournee = (m: Metier) => `Une journée ${deNom(m.nom)} en 2026`;

export function consigneJournee(m: Metier, a: Angle) {
  return `${MARQUE_JOURNEE}
Série « ${titreJournee(m)} » : le scénario d'une journée type, de 5 h du matin jusqu'au soir, à la 2e personne (« tu »).
Métier : ${m.metier}.
Angle de cet épisode : ${a.nom}. Moments à placer (au choix, adaptés au métier) : ${a.details}.
Décor des images, mots-clés anglais pour des séquences filmées : ${m.decor}.
Solution finale : ce que la marque fait réellement pour alléger ce moment. Relie-la à ce métier seulement si la fiche de la marque le permet ; sinon présente en une phrase honnête ce que fait la marque.
${REGLES_PILOTE}`;
}

const nbJours = (de: string, a: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);

// Épisode d'un jour : un métier et un angle différents chaque jour (sur sept
// jours, aucune combinaison ne revient).
export function episodeJournee(jour: string) {
  const k = Math.max(0, nbJours(SERIE_JOURNEE.debut, jour));
  const metier = METIERS_JOURNEE[k % METIERS_JOURNEE.length];
  const angle = ANGLES_JOURNEE[k % ANGLES_JOURNEE.length];
  return { titre: titreJournee(metier), consigne: consigneJournee(metier, angle), metier: metier.id, angle: angle.id };
}

const enMinutes = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const enHeure = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// Heure de l'épisode sur un réseau : le plus près possible de 19 h 30 (soirée,
// là où l'audience réagit le mieux), à plus d'une heure des publications du
// pilote — le moteur refuse deux posts d'un même réseau à moins d'une heure.
export function heureSerie(heuresPilote: string[]): string | null {
  const prises = heuresPilote.map(enMinutes);
  const candidates = Array.from({ length: 31 }, (_, i) => 19 * 60 + i * 5) // 19:00 → 21:30
    .filter((m) => prises.every((p) => Math.abs(p - m) > 60))
    .sort((a, b) => Math.abs(a - 19.5 * 60) - Math.abs(b - 19.5 * 60) || a - b);
  return candidates.length ? enHeure(candidates[0]) : null;
}

// Tâches de l'épisode du jour, au format du pilote : une par réseau de la
// série connecté en français. Rien hors des dates de l'essai, ni si l'heure
// est déjà passée (pilote activé tard dans la journée).
export function tachesJournee(jour: string, canaux: Canal[], rythme: unknown, creneaux: string[], maintenant = new Date()) {
  if (!serieActive(jour)) return [];
  const episode = episodeJournee(jour);
  const limite = maintenant.getTime() + 5 * 60_000;
  const vus = new Set<string>();
  return canaux.flatMap((c) => {
    if (c.marche !== MARCHE_DEFAUT || !SERIE_JOURNEE.reseaux.includes(c.plateforme) || vus.has(c.plateforme)) return [];
    vus.add(c.plateforme);
    const heure = heureSerie(heuresDuJour(postsParJour(rythme, c.plateforme), creneaux));
    const quand = heure ? instantParis(jour, heure) : null;
    if (!quand || quand.getTime() <= limite) return [];
    return [{ plateforme: c.plateforme, marche: c.marche, titre: episode.titre, consigne: episode.consigne, planifiee_pour: quand.toISOString() }];
  });
}
