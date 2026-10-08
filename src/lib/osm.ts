// Recherche de prospects (entreprises) dans OpenStreetMap, gratuite et
// ouverte, via l'API Overpass.

export const CATEGORIES: { id: string; nom: string; tag: [string, string] }[] = [
  { id: "plombier", nom: "Plombiers", tag: ["craft", "plumber"] },
  { id: "electricien", nom: "Électriciens", tag: ["craft", "electrician"] },
  { id: "menuisier", nom: "Menuisiers", tag: ["craft", "carpenter"] },
  { id: "peintre", nom: "Peintres en bâtiment", tag: ["craft", "painter"] },
  { id: "couvreur", nom: "Couvreurs", tag: ["craft", "roofer"] },
  { id: "macon", nom: "Maçons / entreprises du bâtiment", tag: ["craft", "builder"] },
  { id: "chauffagiste", nom: "Chauffagistes", tag: ["craft", "hvac"] },
  { id: "restaurant", nom: "Restaurants", tag: ["amenity", "restaurant"] },
  { id: "cafe", nom: "Cafés / bars", tag: ["amenity", "cafe"] },
  { id: "boulangerie", nom: "Boulangeries", tag: ["shop", "bakery"] },
  { id: "coiffeur", nom: "Coiffeurs", tag: ["shop", "hairdresser"] },
  { id: "beaute", nom: "Instituts de beauté", tag: ["shop", "beauty"] },
  { id: "fleuriste", nom: "Fleuristes", tag: ["shop", "florist"] },
  { id: "vetements", nom: "Boutiques de vêtements", tag: ["shop", "clothes"] },
  { id: "garage", nom: "Garages auto", tag: ["shop", "car_repair"] },
  { id: "immobilier", nom: "Agences immobilières", tag: ["office", "estate_agent"] },
  { id: "avocat", nom: "Avocats", tag: ["office", "lawyer"] },
  { id: "comptable", nom: "Experts-comptables", tag: ["office", "accountant"] },
  { id: "architecte", nom: "Architectes", tag: ["office", "architect"] },
  { id: "dentiste", nom: "Dentistes", tag: ["amenity", "dentist"] },
  { id: "hotel", nom: "Hôtels", tag: ["tourism", "hotel"] },
  { id: "sport", nom: "Salles de sport", tag: ["leisure", "fitness_centre"] },
];

const echapper = (s: string) => s.replace(/[\\"]/g, "\\$&");

// Pays où la prospection par e-mail est possible sans accord préalable, et à
// quelles adresses. Belgique : adresses impersonnelles d'entreprise seulement
// (contact@, info@…). Ailleurs (Allemagne, Espagne, Italie…) l'accord
// préalable est exigé même entre entreprises : pas de prospection par e-mail.
export const PAYS_PROSPECTION = [
  { code: "FR", nom: "France", adresses: "toutes" },
  { code: "BE", nom: "Belgique (francophone)", adresses: "impersonnelles" },
] as const;
export type CodePays = (typeof PAYS_PROSPECTION)[number]["code"];

const echapperRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function requeteOverpass(categorie: string, ville: string, max: number, pays: CodePays = "FR") {
  const c = CATEGORIES.find((x) => x.id === categorie);
  if (!c) throw new Error("Catégorie inconnue.");
  const [cle, valeur] = c.tag;
  const limite = Math.min(Math.max(max, 1), 200);
  if (pays === "FR")
    return `[out:json][timeout:50];
area["name"="${echapper(ville.trim())}"]["boundary"="administrative"]["admin_level"="8"]->.zone;
nwr(area.zone)["${cle}"="${valeur}"]["name"];
out center tags ${limite};`;
  // Hors de France : commune cherchée dans le pays (évite les homonymes
  // français), par son nom ou son nom en français (Bruxelles - Brussel).
  const nom = echapper(echapperRegex(ville.trim()));
  return `[out:json][timeout:50];
area["ISO3166-1"="${pays}"]["admin_level"="2"]->.pays;
rel(area.pays)["boundary"="administrative"]["admin_level"="8"][~"^name(:fr)?$"~"^${nom}$",i];
map_to_area->.zone;
nwr(area.zone)["${cle}"="${valeur}"]["name"];
out center tags ${limite};`;
}

// Les contributeurs OSM écrivent parfois « mailto:… » ou plusieurs adresses.
export function nettoyerEmail(brut: string | null | undefined): string | null {
  const premiere = (brut ?? "").split(/[;,\s]/).map((x) => x.replace(/^mailto:/i, "").trim()).find((x) => /^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,24}$/i.test(x));
  return premiere ? premiere.toLowerCase() : null;
}

export type ProspectTrouve = {
  nom: string;
  email: string | null;
  telephone: string | null;
  site: string | null;
  adresse: string | null;
  osm_id: string;
};

type Element = { type: string; id: number; tags?: Record<string, string> };

export function lireReponseOverpass(texte: string): ProspectTrouve[] {
  // Overpass renvoie parfois le JSON enveloppé dans une page HTML.
  const brut = texte.trimStart().startsWith("<") ? texte.replace(/<[^>]*>/g, "") : texte;
  let json: { elements?: Element[]; remark?: string };
  try {
    json = JSON.parse(brut.slice(brut.indexOf("{")));
  } catch {
    throw new Error("Réponse illisible du service de recherche. Réessayez dans un instant.");
  }
  // Délai dépassé ou serveur saturé : réponse 200 sans résultat, avec une
  // remarque. On le traite comme une panne (serveur suivant).
  if (!json.elements?.length && /error|timed out|out of memory/i.test(json.remark ?? "")) {
    throw new Error(`Service de recherche saturé : ${json.remark?.slice(0, 120)}`);
  }
  const vus = new Set<string>();
  const resultats: ProspectTrouve[] = [];
  for (const e of json.elements ?? []) {
    const t = e.tags ?? {};
    if (!t.name) continue;
    const cleDoublon = t.name.toLowerCase();
    if (vus.has(cleDoublon)) continue;
    vus.add(cleDoublon);
    const adresse = [t["addr:housenumber"], t["addr:street"], t["addr:postcode"], t["addr:city"]]
      .filter(Boolean)
      .join(" ");
    resultats.push({
      nom: t.name,
      email: nettoyerEmail(t.email ?? t["contact:email"]),
      telephone: t.phone ?? t["contact:phone"] ?? null,
      site: t.website ?? t["contact:website"] ?? null,
      adresse: adresse || null,
      osm_id: `${e.type}/${e.id}`,
    });
  }
  return resultats;
}
