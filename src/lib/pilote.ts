import { z } from "zod";
import { PLATEFORMES } from "./plateformes";

// Pilote automatique : chaque jour, l'agent planifie seul N publications par
// réseau connecté, aux créneaux choisis (heure de Paris). Logique pure,
// partagée par le moteur, l'interface et le connecteur MCP.

export const CRENEAUX_DEFAUT = ["08:30", "12:30", "18:30"];
export const RYTHME_DEFAUT = 3;
export const RYTHME_MAX = 5;
export const CRENEAUX_MAX = 6;
export const HEURE_DEBUT_PLANIFICATION = 5; // premier passage après 05:00 (Paris)
const FUSEAU = "Europe/Paris";

export type Rythme = Record<string, number>;

// Réseaux que le pilote peut alimenter : pas de messagerie ni d'e-mail, pas
// de réseau « manuel » (profil Facebook perso, sans API).
export const estPilotable = (id: string) => {
  const p = PLATEFORMES.find((x) => x.id === id);
  return Boolean(
    p && !p.manuel && (p.categorie === "reseau" || p.categorie === "local"),
  );
};

// Nombre de posts par jour d'un réseau : 3 par défaut, entre 1 et 5.
export function postsParJour(rythme: unknown, plateforme: string) {
  const brut =
    rythme && typeof rythme === "object"
      ? (rythme as Rythme)[plateforme]
      : undefined;
  const n = Math.round(Number(brut ?? RYTHME_DEFAUT));
  return Number.isFinite(n)
    ? Math.min(RYTHME_MAX, Math.max(1, n))
    : RYTHME_DEFAUT;
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const versMinutes = (h: string) =>
  Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const versHeure = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// Créneaux valides (« 8:30 » accepté), sans doublon, triés ; défaut si vide.
export function normaliserCreneaux(liste: unknown): string[] {
  const propres = (Array.isArray(liste) ? liste : [])
    .map((x) =>
      String(x ?? "")
        .trim()
        .replace(/^(\d):/, "0$1:"),
    )
    .filter((x) => HHMM.test(x));
  const uniques = [...new Set(propres)].sort().slice(0, CRENEAUX_MAX);
  return uniques.length ? uniques : [...CRENEAUX_DEFAUT];
}

// Heures de publication d'un réseau pour N posts : les créneaux choisis
// (répartis au mieux si N est plus petit), sinon N heures régulières entre
// 08:00 et 21:00, arrondies à 5 minutes.
export function heuresDuJour(n: number, creneaux: string[]): string[] {
  const c = normaliserCreneaux(creneaux);
  if (n <= 0) return [];
  if (n === c.length) return c;
  if (n < c.length) {
    if (n === 1) return [c[Math.floor((c.length - 1) / 2)]];
    return Array.from(
      { length: n },
      (_, i) => c[Math.round((i * (c.length - 1)) / (n - 1))],
    );
  }
  const debut = 8 * 60;
  const fin = 21 * 60;
  return Array.from({ length: n }, (_, i) =>
    versHeure(Math.round((debut + (i * (fin - debut)) / (n - 1)) / 5) * 5),
  );
}

// --- Mélange des sujets ------------------------------------------------------

export const CATEGORIES_SUJET = [
  {
    id: "conseil",
    poids: 4,
    consigne:
      "Conseil utile pour la clientèle visée (un problème concret qu'elle rencontre et comment le résoudre).",
  },
  {
    id: "demo",
    poids: 3,
    consigne:
      "Démonstration concrète du produit ou du service : une fonctionnalité réelle, montrée en situation.",
  },
  {
    id: "coulisses",
    poids: 2,
    consigne:
      "Coulisses, terrain ou pédagogie : comment on travaille, ce qu'on apprend, une notion expliquée simplement.",
  },
  {
    id: "offre",
    poids: 1,
    consigne:
      "Offre directe : ce que la marque propose, pour qui, et l'appel à l'action (sans promesse inventée).",
  },
] as const;

export type CategorieSujet = (typeof CATEGORIES_SUJET)[number]["id"];

// Cycle de 10 catégories respectant 40/30/20/10, bien réparties (tourniquet
// pondéré « lisse ») : conseil, demo, coulisses, conseil, …
export const CYCLE_SUJETS: CategorieSujet[] = (() => {
  const total = CATEGORIES_SUJET.reduce((s, c) => s + c.poids, 0);
  const courant = CATEGORIES_SUJET.map(() => 0);
  const cycle: CategorieSujet[] = [];
  for (let i = 0; i < total; i++) {
    CATEGORIES_SUJET.forEach((c, j) => (courant[j] += c.poids));
    const choisi = courant.indexOf(Math.max(...courant));
    courant[choisi] -= total;
    cycle.push(CATEGORIES_SUJET[choisi].id);
  }
  return cycle;
})();

// Catégories des k sujets d'un jour. Le cycle continue d'un jour à l'autre
// (3 sujets par jour : sur 10 jours, 12 conseils, 9 démos, 6 coulisses, 3 offres).
export function melangeDuJour(jour: string, k: number): CategorieSujet[] {
  const numero = Math.floor(Date.parse(`${jour}T00:00:00Z`) / 86_400_000);
  const depart =
    (((numero * k) % CYCLE_SUJETS.length) + CYCLE_SUJETS.length) %
    CYCLE_SUJETS.length;
  return Array.from(
    { length: k },
    (_, i) => CYCLE_SUJETS[(depart + i) % CYCLE_SUJETS.length],
  );
}

// --- Heure de Paris ----------------------------------------------------------

function partiesParis(instant: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: FUSEAU,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(instant)
      .map((x) => [x.type, x.value]),
  );
  return {
    jour: `${p.year}-${p.month}-${p.day}`,
    minutes: Number(p.hour) * 60 + Number(p.minute),
  };
}

export const jourParis = (instant = new Date()) => partiesParis(instant).jour;
export const minutesParis = (instant = new Date()) =>
  partiesParis(instant).minutes;

// « 2026-10-01 » + « 08:30 » (heure de Paris) → instant UTC.
export function instantParis(jour: string, heure: string): Date {
  const [a, m, j] = jour.split("-").map(Number);
  const cible = Date.UTC(a, m - 1, j, 0, 0) + versMinutes(heure) * 60_000;
  let t = cible;
  for (let i = 0; i < 2; i++) {
    const vu = partiesParis(new Date(t));
    const [va, vm, vj] = vu.jour.split("-").map(Number);
    const ecart = Date.UTC(va, vm - 1, vj, 0, 0) + vu.minutes * 60_000 - cible;
    t -= ecart;
  }
  return new Date(t);
}

// --- Plan du jour ------------------------------------------------------------

export type Creneau = {
  plateforme: string;
  heure: string;
  quand: string;
  sujet: number;
};

// Créneaux restant à planifier aujourd'hui pour chaque réseau pilotable. Un
// même sujet par heure (décliné sur tous les réseaux), des sujets différents
// d'une heure à l'autre. Les heures passées (ou dans moins de 5 min) sont
// ignorées : pilote activé en cours de journée.
export function planDuJour(
  plateformes: string[],
  rythme: unknown,
  creneaux: string[],
  jour: string,
  maintenant = new Date(),
): { heures: string[]; creneaux: Creneau[] } {
  const reseaux = [...new Set(plateformes)].filter(estPilotable);
  const limite = maintenant.getTime() + 5 * 60_000;
  const brut = reseaux.flatMap((plateforme) =>
    heuresDuJour(postsParJour(rythme, plateforme), creneaux)
      .map((heure) => ({ plateforme, heure, quand: instantParis(jour, heure) }))
      .filter((c) => c.quand.getTime() > limite),
  );
  const heures = [...new Set(brut.map((c) => c.heure))].sort();
  return {
    heures,
    creneaux: brut.map((c) => ({
      plateforme: c.plateforme,
      heure: c.heure,
      quand: c.quand.toISOString(),
      sujet: heures.indexOf(c.heure),
    })),
  };
}

// --- Choix des sujets par l'IA ----------------------------------------------

export const REGLES_PILOTE =
  "Règles : pas de faux témoignage ni d'avis client inventé, pas de chiffre inventé (prix, statistiques, résultats), texte brut sans markdown.";

export function consigneSujets(p: {
  contexte: string | null;
  categories: CategorieSujet[];
  titresRecents: string[];
  apprentissage?: string | null;
  jour: string;
  ferie?: string | null;
}) {
  const lignes = p.categories
    .map(
      (c, i) =>
        `${i + 1}. ${CATEGORIES_SUJET.find((x) => x.id === c)?.consigne}`,
    )
    .join("\n");
  const recents = p.titresRecents
    .slice(0, 80)
    .map((t) => `- ${t}`)
    .join("\n");
  return `Tu es le responsable éditorial des réseaux sociaux de cette entreprise. Choisis les ${p.categories.length} sujets de publication du ${p.jour}.

${p.contexte ? `Contexte de la marque (source fiable) :\n${p.contexte.slice(0, 5000)}\n` : ""}
Un sujet par ligne, dans cet ordre et de ce type :
${lignes}
${recents ? `\nSujets déjà traités ces 30 derniers jours (ne les répète pas, ni sous une autre formulation) :\n${recents}\n` : ""}${
    p.apprentissage
      ? `\nCe qui marche le mieux d'après les résultats passés (inspire-t'en) :\n${p.apprentissage.slice(0, 1500)}\n`
      : ""
  }${p.ferie ? `\nCalendrier : ${p.ferie}. Tu peux t'en servir pour un sujet de saison, sans obligation.\n` : ""}
Les ${p.categories.length} sujets doivent être tous différents, concrets et propres à cette marque (ses vraies fonctionnalités, sa vraie clientèle).
${REGLES_PILOTE}
Réponds UNIQUEMENT par un objet JSON valide, sans texte autour :
{"sujets": [{"titre": "titre court (6 à 10 mots)", "consigne": "angle, accroche et appel à l'action en 1 à 3 phrases"}]}`;
}

// Jours fériés (liste Nager.Date : [{date, localName}]) : celui du jour, sinon
// le prochain dans les 3 jours. null s'il n'y en a pas ou si la liste est illisible.
export function ferieProche(liste: unknown, jour: string): string | null {
  if (!Array.isArray(liste)) return null;
  const base = Date.parse(`${jour}T00:00:00Z`);
  for (const f of liste) {
    const date = typeof f?.date === "string" ? f.date : "";
    const nom = typeof f?.localName === "string" ? f.localName : "";
    const ecart = Math.round(
      (Date.parse(`${date}T00:00:00Z`) - base) / 86_400_000,
    );
    if (!nom || Number.isNaN(ecart) || ecart < 0 || ecart > 3) continue;
    return ecart === 0
      ? `aujourd'hui, c'est ${nom} (jour férié)`
      : `${nom} (jour férié) dans ${ecart} jour${ecart > 1 ? "s" : ""}`;
  }
  return null;
}

const cle = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^\p{L}\p{N}]+/gu, "");

const schemaSujets = z.object({
  sujets: z
    .array(
      z
        .object({ titre: z.string().catch(""), consigne: z.string().catch("") })
        .catch({ titre: "", consigne: "" }),
    )
    .catch([]),
});

export type Sujet = { titre: string; consigne: string };

// Lit la réponse de l'IA : exactement k sujets distincts, jamais un titre des
// 30 derniers jours. null si la réponse est inutilisable (réessai plus tard).
export function lireSujets(
  reponse: string,
  k: number,
  titresRecents: string[] = [],
): Sujet[] | null {
  const debut = reponse.indexOf("{");
  const fin = reponse.lastIndexOf("}");
  if (debut === -1 || fin <= debut || k <= 0) return null;
  let brut: z.infer<typeof schemaSujets>;
  try {
    brut = schemaSujets.parse(JSON.parse(reponse.slice(debut, fin + 1)));
  } catch {
    return null;
  }
  const vus = new Set(titresRecents.map(cle));
  const sujets: Sujet[] = [];
  for (const s of brut.sujets) {
    const titre = s.titre
      .replace(/[*_#`]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
    const consigne = s.consigne
      .replace(/[*_#`]/g, "")
      .trim()
      .slice(0, 1200);
    if (!titre || vus.has(cle(titre))) continue;
    vus.add(cle(titre));
    sujets.push({ titre, consigne: consigne || titre });
  }
  return sujets.length >= k ? sujets.slice(0, k) : null;
}

// Tâches prêtes à enregistrer : un sujet par heure, décliné sur chaque réseau.
export function tachesDuJour(
  creneaux: Creneau[],
  sujets: Sujet[],
  categories: CategorieSujet[],
) {
  return creneaux.map((c) => {
    const s = sujets[c.sujet];
    const type = CATEGORIES_SUJET.find((x) => x.id === categories[c.sujet]);
    return {
      plateforme: c.plateforme,
      titre: s.titre,
      consigne: `${s.consigne}\n\nType de publication : ${type?.consigne ?? ""}\n${REGLES_PILOTE}`,
      planifiee_pour: c.quand,
    };
  });
}
