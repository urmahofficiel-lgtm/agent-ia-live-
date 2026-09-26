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

export function requeteOverpass(categorie: string, ville: string, max: number) {
  const c = CATEGORIES.find((x) => x.id === categorie);
  if (!c) throw new Error("Catégorie inconnue.");
  const [cle, valeur] = c.tag;
  return `[out:json][timeout:25];
area["name"="${echapper(ville.trim())}"]["boundary"="administrative"]->.zone;
nwr(area.zone)["${cle}"="${valeur}"]["name"];
out center tags ${Math.min(Math.max(max, 1), 200)};`;
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
  let json: { elements?: Element[] };
  try {
    json = JSON.parse(brut.slice(brut.indexOf("{")));
  } catch {
    throw new Error("Réponse illisible du service de recherche. Réessayez dans un instant.");
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
      email: t.email ?? t["contact:email"] ?? null,
      telephone: t.phone ?? t["contact:phone"] ?? null,
      site: t.website ?? t["contact:website"] ?? null,
      adresse: adresse || null,
      osm_id: `${e.type}/${e.id}`,
    });
  }
  return resultats;
}
