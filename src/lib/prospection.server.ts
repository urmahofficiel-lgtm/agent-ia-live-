import {
  fusionner,
  lireAnnuaire,
  urlAnnuaire,
  type EntrepriseAnnuaire,
  type ProspectComplet,
} from "./annuaire";
import { demanderIA } from "./ia.server";
import {
  lireReponseOverpass,
  requeteOverpass,
  type ProspectTrouve,
} from "./osm";
import {
  choisirCanal,
  consigneMessage,
  lireMessage,
  type BrouillonProspect,
  type Canal,
  type ProspectARediger,
} from "./prospection";

// OpenStreetMap (Overpass) : souvent téléphone, e-mail et site.
async function chercherOsm(
  categorie: string,
  ville: string,
  max: number,
): Promise<ProspectTrouve[]> {
  const r = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "agent-ia-live/0.1 (prospection)",
      Accept: "application/json",
    },
    body: new URLSearchParams({ data: requeteOverpass(categorie, ville, max) }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok)
    throw new Error(
      `Service de recherche indisponible (${r.status}). Réessayez.`,
    );
  return lireReponseOverpass(await r.text());
}

// Annuaire officiel des entreprises : codes postaux de la commune (API Géo),
// puis jusqu'à 2 pages de 25 établissements actifs.
async function chercherAnnuaire(
  categorie: string,
  ville: string,
  max: number,
): Promise<EntrepriseAnnuaire[]> {
  const g = await fetch(
    `https://geo.api.gouv.fr/communes?${new URLSearchParams({ nom: ville.trim(), fields: "nom,codesPostaux", boost: "population", limit: "1" })}`,
    { signal: AbortSignal.timeout(10_000) },
  );
  if (!g.ok) return [];
  const communes = (await g.json()) as { codesPostaux?: string[] }[];
  const cps = communes[0]?.codesPostaux ?? [];
  const sortie: EntrepriseAnnuaire[] = [];
  for (let page = 1; page <= 2 && sortie.length < max; page++) {
    const url = urlAnnuaire(categorie, cps, page);
    if (!url) break;
    const r = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) break;
    const lus = lireAnnuaire(await r.json(), cps);
    sortie.push(...lus);
    if (lus.length < 20) break;
  }
  return sortie;
}

// Entreprises d'une catégorie dans une ville : les deux sources en parallèle ;
// une source en panne n'empêche pas l'autre.
export async function chercherEntreprises(
  categorie: string,
  ville: string,
  max: number,
): Promise<ProspectComplet[]> {
  const [osm, annuaire] = await Promise.allSettled([
    chercherOsm(categorie, ville, max),
    chercherAnnuaire(categorie, ville, max),
  ]);
  if (
    osm.status === "rejected" &&
    (annuaire.status === "rejected" || !annuaire.value.length)
  )
    throw osm.reason;
  return fusionner(
    osm.status === "fulfilled" ? osm.value : [],
    annuaire.status === "fulfilled" ? annuaire.value : [],
    max,
  );
}

// Rédige le message (premier contact ou relance). Aucun envoi : le brouillon
// est enregistré « à valider ».
export async function redigerMessageProspect(
  p: ProspectARediger,
  prefere?: Canal,
): Promise<BrouillonProspect> {
  const canal = choisirCanal(p, prefere);
  const reponse = await demanderIA(consigneMessage(p, canal), {
    systeme:
      "Tu rédiges des messages de prospection B2B honnêtes et concis. Tu réponds uniquement en JSON valide.",
    maxTokens: 600,
    delaiTotal: 50_000,
  });
  return lireMessage(reponse, canal, p.genre);
}
