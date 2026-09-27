import { z } from "zod";
import { PLATEFORMES } from "./plateformes";

// Profil saisi par l'utilisateur et analyse de marché produite par l'IA.

export type Profil = {
  activite: string;
  offre: string;
  cible: string;
  zone: string;
  ton: string;
  site: string;
  objectif: string;
};

const texte = z.string().catch("");
const liste = z.array(z.string()).catch([]);

export const schemaAnalyse = z.object({
  resume_niche: texte,
  positionnement: texte,
  marche: texte,
  concurrence: texte,
  cibles: z
    .array(z.object({ persona: texte, besoins: texte, freins: texte, ou_les_trouver: texte }))
    .catch([]),
  piliers: z.array(z.object({ theme: texte, idees: liste })).catch([]),
  plateformes: z
    .array(
      z.object({
        id: texte,
        priorite: z.number().catch(3),
        pourquoi: texte,
        frequence: texte,
        meilleurs_moments: texte,
        formats: texte,
      }),
    )
    .catch([]),
  hashtags: liste,
  angles_prospection: liste,
});

export type Analyse = z.infer<typeof schemaAnalyse>;

export function consigneAnalyse(p: Profil, extraitSite?: string) {
  const ids = PLATEFORMES.filter((x) => x.zernio).map((x) => x.id).join(", ");
  return `Tu es un stratège marketing expert du marché français. Analyse la niche de cette entreprise et construis sa stratégie réseaux sociaux et prospection.

Entreprise :
- Activité : ${p.activite || "?"}
- Offre / produits : ${p.offre || "?"}
- Clientèle visée : ${p.cible || "?"}
- Zone : ${p.zone || "?"}
- Ton souhaité : ${p.ton || "?"}
- Site : ${p.site || "?"}
- Objectif : ${p.objectif || "?"}
${extraitSite ? `\nExtrait de son site (source fiable, appuie-toi dessus) :\n${extraitSite.slice(0, 6000)}\n` : ""}
Réponds UNIQUEMENT par un objet JSON valide, sans texte autour, de la forme :
{
 "resume_niche": "la niche précise en 2 phrases",
 "positionnement": "comment se différencier, 2 phrases",
 "marche": "tendances et opportunités du marché, 3-4 phrases",
 "concurrence": "types de concurrents et ce qu'ils font, 2-3 phrases",
 "cibles": [{"persona": "nom court", "besoins": "...", "freins": "...", "ou_les_trouver": "réseaux, lieux, groupes"}],
 "piliers": [{"theme": "thème de contenu", "idees": ["idée de post 1", "idée 2", "idée 3"]}],
 "plateformes": [{"id": un de [${ids}], "priorite": 1 à 5 (1 = prioritaire), "pourquoi": "...", "frequence": "ex. 3 posts/semaine", "meilleurs_moments": "jours et heures", "formats": "formats qui marchent"}],
 "hashtags": ["#...", "..."],
 "angles_prospection": ["angle d'approche 1", "..."]
}
Donne 2 à 4 cibles, 4 à 5 piliers, seulement les 3 à 5 plateformes vraiment pertinentes, 8 à 15 hashtags, 3 à 5 angles. Sois concret et spécifique à cette niche.`;
}

export function lireAnalyse(reponse: string): Analyse | null {
  const debut = reponse.indexOf("{");
  const fin = reponse.lastIndexOf("}");
  if (debut === -1 || fin <= debut) return null;
  try {
    const a = schemaAnalyse.parse(JSON.parse(reponse.slice(debut, fin + 1)));
    const ids = new Set(PLATEFORMES.map((p) => p.id));
    a.plateformes = a.plateformes.filter((p) => ids.has(p.id)).sort((x, y) => x.priorite - y.priorite);
    return a.resume_niche ? a : null;
  } catch {
    return null;
  }
}

// Demande de planification construite à partir de la stratégie.
export function demandeDepuisStrategie(a: Analyse, connectes: string[], jours: number) {
  const cibles = a.plateformes.filter((p) => connectes.length === 0 || connectes.includes(p.id));
  const plateformes = (cibles.length ? cibles : a.plateformes)
    .map((p) => `${p.id} (${p.frequence}, ${p.meilleurs_moments})`)
    .join("; ");
  const piliers = a.piliers.map((p) => `${p.theme} : ${p.idees.join(" / ")}`).join("\n");
  return `Crée le calendrier de publications des ${jours} prochains jours.
Plateformes à utiliser, avec leur fréquence et leurs horaires : ${plateformes}.
Alterne ces thèmes :
${piliers}
Chaque tâche est de type "publication", avec une consigne précise (angle, accroche, appel à l'action).
Couvre à tour de rôle les différentes fonctionnalités réelles de la marque listées dans le contexte, pour que chaque post fasse la promotion d'un aspect concret de son offre.`;
}

const champ = z.string().catch("").transform((x) => x.trim().slice(0, 1500));
const listeCourte = z
  .array(z.string())
  .catch([])
  .transform((l) => l.map((x) => x.trim()).filter(Boolean).slice(0, 15));

const schemaDeduit = z.object({
  nom: champ,
  slogan: champ,
  activite: champ,
  offre: champ,
  cible: champ,
  zone: champ,
  ton: champ,
  objectif: champ,
  fonctionnalites: listeCourte,
  benefices: listeCourte,
  preuves: listeCourte,
  tarifs: champ,
  appel_action: champ,
  lien_cta: champ,
  univers_visuel: champ,
});

export type Fiche = {
  nom: string;
  slogan: string;
  fonctionnalites: string[];
  benefices: string[];
  preuves: string[];
  tarifs: string;
  appel_action: string;
  lien_cta: string;
  univers_visuel: string;
};

// Profil + fiche marque déduits d'un site par l'IA.
export function lireProfilDeduit(reponse: string): { profil: Omit<Profil, "site">; nom: string; fiche: Fiche } | null {
  const debut = reponse.indexOf("{");
  const fin = reponse.lastIndexOf("}");
  if (debut === -1 || fin <= debut) return null;
  try {
    const d = schemaDeduit.parse(JSON.parse(reponse.slice(debut, fin + 1)));
    if (!d.activite) return null;
    const { activite, offre, cible, zone, ton, objectif, ...reste } = d;
    const lien = /^https?:\/\//.test(reste.lien_cta) ? reste.lien_cta : "";
    return {
      profil: { activite, offre, cible, zone, ton, objectif },
      nom: d.nom,
      fiche: { ...reste, lien_cta: lien },
    };
  } catch {
    return null;
  }
}
