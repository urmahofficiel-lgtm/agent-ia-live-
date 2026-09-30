import { demanderIA } from "./ia.server";
import { lireReponseOverpass, requeteOverpass, type ProspectTrouve } from "./osm";
import { choisirCanal, consigneMessage, lireMessage, type BrouillonProspect, type Canal, type ProspectARediger } from "./prospection";

// Entreprises d'une catégorie dans une ville (OpenStreetMap / Overpass).
export async function chercherEntreprises(categorie: string, ville: string, max: number): Promise<ProspectTrouve[]> {
  const r = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "agent-ia-live/0.1 (prospection)",
      Accept: "application/json",
    },
    body: new URLSearchParams({ data: requeteOverpass(categorie, ville, max) }),
  });
  if (!r.ok) throw new Error(`Service de recherche indisponible (${r.status}). Réessayez.`);
  return lireReponseOverpass(await r.text());
}

// Rédige le message (premier contact ou relance). Aucun envoi : le brouillon
// est enregistré « à valider ».
export async function redigerMessageProspect(p: ProspectARediger, prefere?: Canal): Promise<BrouillonProspect> {
  const canal = choisirCanal(p, prefere);
  const reponse = await demanderIA(consigneMessage(p, canal), {
    systeme: "Tu rédiges des messages de prospection B2B honnêtes et concis. Tu réponds uniquement en JSON valide.",
    maxTokens: 600,
    delaiTotal: 50_000,
  });
  return lireMessage(reponse, canal, p.genre);
}
