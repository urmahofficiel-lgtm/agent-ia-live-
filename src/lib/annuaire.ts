// Annuaire officiel des entreprises (API Recherche d'entreprises de l'État,
// données INSEE / RNE, gratuite et sans clé) : complète OpenStreetMap avec le
// SIRET, l'ancienneté, la taille et la certification RGE, et trouve les
// entreprises absentes de la carte. Les entreprises dont la diffusion est
// restreinte (opposition à la prospection) sont écartées.

import type { ProspectTrouve } from "./osm";

// Codes NAF par catégorie de prospection (voir CATEGORIES dans osm.ts).
export const NAF: Record<string, string[]> = {
  plombier: ["43.22A"],
  electricien: ["43.21A"],
  menuisier: ["43.32A"],
  peintre: ["43.34Z"],
  couvreur: ["43.91B"],
  macon: ["43.99C", "41.20A"],
  chauffagiste: ["43.22B"],
  restaurant: ["56.10A"],
  cafe: ["56.30Z"],
  boulangerie: ["10.71C"],
  coiffeur: ["96.02A"],
  beaute: ["96.02B"],
  fleuriste: ["47.76Z"],
  vetements: ["47.71Z"],
  garage: ["45.20A"],
  immobilier: ["68.31Z"],
  avocat: ["69.10Z"],
  comptable: ["69.20Z"],
  architecte: ["71.11Z"],
  dentiste: ["86.23Z"],
  hotel: ["55.10Z"],
  sport: ["93.13Z"],
};

const EFFECTIFS: Record<string, string> = {
  "00": "sans salarié",
  "01": "1 à 2 salariés",
  "02": "3 à 5 salariés",
  "03": "6 à 9 salariés",
  "11": "10 à 19 salariés",
  "12": "20 à 49 salariés",
  "21": "50 à 99 salariés",
  "22": "100 à 199 salariés",
  "31": "200 à 249 salariés",
  "32": "250 à 499 salariés",
};

export function urlAnnuaire(
  categorie: string,
  codesPostaux: string[],
  page = 1,
) {
  const naf = NAF[categorie];
  if (!naf || !codesPostaux.length) return null;
  const q = new URLSearchParams({
    activite_principale: naf.join(","),
    code_postal: codesPostaux.slice(0, 30).join(","),
    etat_administratif: "A",
    per_page: "25",
    page: String(page),
  });
  return `https://recherche-entreprises.api.gouv.fr/search?${q}`;
}

type Etablissement = {
  siret?: string;
  adresse?: string;
  code_postal?: string;
  etat_administratif?: string;
  statut_diffusion_etablissement?: string;
  nom_commercial?: string | null;
  liste_enseignes?: string[] | null;
  liste_rge?: string[] | null;
  date_creation?: string | null;
  tranche_effectif_salarie?: string | null;
};
type Entreprise = {
  nom_complet?: string;
  statut_diffusion?: string;
  date_creation?: string | null;
  tranche_effectif_salarie?: string | null;
  complements?: { est_rge?: boolean } | null;
  matching_etablissements?: Etablissement[] | null;
};

export type EntrepriseAnnuaire = Omit<ProspectTrouve, "osm_id"> & {
  siret: string;
  infos: string;
};

const formaterSiret = (s: string) =>
  s.replace(/^(\d{3})(\d{3})(\d{3})(\d{5})$/, "$1 $2 $3 $4");

// Résumé lisible (fiche CRM et personnalisation du message).
export function infosEntreprise(e: Entreprise, et: Etablissement) {
  const annee = (e.date_creation ?? et.date_creation ?? "").slice(0, 4);
  const effectif =
    EFFECTIFS[et.tranche_effectif_salarie ?? ""] ??
    EFFECTIFS[e.tranche_effectif_salarie ?? ""];
  const rge = e.complements?.est_rge || (et.liste_rge?.length ?? 0) > 0;
  return [
    et.siret ? `SIRET ${formaterSiret(et.siret)}` : "",
    /^\d{4}$/.test(annee) ? `créée en ${annee}` : "",
    effectif ?? "",
    rge ? "certifiée RGE" : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

const titre = (s: string) =>
  s.toLowerCase().replace(/(^|[\s'’-])\p{L}/gu, (m) => m.toUpperCase());

export function lireAnnuaire(
  json: unknown,
  codesPostaux: string[],
): EntrepriseAnnuaire[] {
  const resultats = (json as { results?: Entreprise[] } | null)?.results;
  if (!Array.isArray(resultats)) return [];
  const cps = new Set(codesPostaux);
  const sortie: EntrepriseAnnuaire[] = [];
  for (const e of resultats) {
    if (e.statut_diffusion && e.statut_diffusion !== "O") continue;
    const et = (e.matching_etablissements ?? []).find(
      (x) =>
        x.siret &&
        x.etat_administratif !== "F" &&
        (x.statut_diffusion_etablissement ?? "O") === "O" &&
        (!cps.size || cps.has(x.code_postal ?? "")),
    );
    if (!et?.siret) continue;
    const nom = et.nom_commercial || et.liste_enseignes?.[0] || e.nom_complet;
    if (!nom) continue;
    sortie.push({
      nom: titre(nom),
      email: null,
      telephone: null,
      site: null,
      adresse: et.adresse ? titre(et.adresse) : null,
      siret: et.siret,
      infos: infosEntreprise(e, et),
    });
  }
  return sortie;
}

export const cleNom = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(
      /\b(sarl|sas|sasu|eurl|sa|ets|entreprise|societe|et|fils|the|le|la|les|de|du|des)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();

export type ProspectComplet = Omit<ProspectTrouve, "osm_id"> & {
  osm_id: string | null;
  siret: string | null;
  infos: string | null;
  origine: "osm" | "annuaire";
};

// Fusion : les fiches OpenStreetMap (qui ont souvent téléphone, e-mail, site)
// d'abord, enrichies du SIRET quand le nom correspond ; puis les entreprises
// trouvées seulement dans l'annuaire, jusqu'à `max`.
export function fusionner(
  osm: ProspectTrouve[],
  annuaire: EntrepriseAnnuaire[],
  max: number,
): ProspectComplet[] {
  const restants = [...annuaire];
  const sortie: ProspectComplet[] = osm.map((p) => {
    const n = cleNom(p.nom);
    const i = n ? restants.findIndex((a) => cleNom(a.nom) === n) : -1;
    const a = i >= 0 ? restants.splice(i, 1)[0] : null;
    return {
      ...p,
      adresse: p.adresse ?? a?.adresse ?? null,
      siret: a?.siret ?? null,
      infos: a?.infos ?? null,
      origine: "osm",
    };
  });
  for (const a of restants) {
    if (sortie.length >= max) break;
    sortie.push({ ...a, osm_id: null, origine: "annuaire" });
  }
  return sortie.slice(0, Math.max(max, osm.length));
}
