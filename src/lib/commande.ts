import { z } from "zod";
import { PLATEFORMES } from "./plateformes";

// Transforme une demande en langage courant (« publie 3 posts LinkedIn cette
// semaine sur mon offre ») en tâches structurées.

export const TYPES_TACHE = ["publication", "reponse", "prospection", "relance", "appareil", "autre"] as const;

const tachePlanifiee = z.object({
  type: z.enum(TYPES_TACHE).catch("autre"),
  plateforme: z.string().nullable().optional(),
  titre: z.string().min(1).max(200),
  consigne: z.string().max(2000).default(""),
  dans_jours: z.number().min(0).max(60).catch(0).default(0),
  heure: z.number().int().min(0).max(23).catch(10).default(10),
});

export type TachePlanifiee = z.infer<typeof tachePlanifiee>;

export function consignePlanification(demande: string, maintenant: Date, contexte?: string | null) {
  const ids = PLATEFORMES.map((p) => p.id).join(", ");
  return `Nous sommes le ${maintenant.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}.
Découpe la demande suivante en tâches concrètes pour un agent qui gère les réseaux sociaux et la prospection.
Réponds UNIQUEMENT par un tableau JSON, sans texte autour. Chaque élément :
{"type": "publication"|"reponse"|"prospection"|"relance"|"appareil"|"autre", "plateforme": un de [${ids}] ou null, "titre": "court", "consigne": "détaillée pour la rédaction", "dans_jours": nombre de jours à partir d'aujourd'hui (0 = aujourd'hui), "heure": heure de publication 0-23}
Répartis les publications dans le temps si plusieurs sont demandées. Maximum 20 tâches.
Contraintes : chaque publication est un post texte + une image (pas de vidéo, live, webinaire, PDF, sondage ni infographie).
Chaque consigne cite la fonctionnalité ou le bénéfice précis de la marque à mettre en avant, et rappelle de finir par l'appel à l'action avec le lien.
N'invente aucun chiffre, témoignage, client ou étude de cas absent du contexte.
${contexte ? `\nContexte de l'entreprise (adapte les sujets à cette niche) :\n${contexte}\n` : ""}
Demande : ${demande}`;
}

// Extrait le premier tableau JSON de la réponse (les modèles ajoutent parfois
// du texte ou des balises ``` autour) et ne garde que les tâches valides.
export function lirePlan(reponse: string): TachePlanifiee[] {
  const debut = reponse.indexOf("[");
  const fin = reponse.lastIndexOf("]");
  if (debut === -1 || fin <= debut) return [];
  let brut: unknown;
  try {
    brut = JSON.parse(reponse.slice(debut, fin + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(brut)) return [];
  const ids = new Set(PLATEFORMES.map((p) => p.id));
  return brut
    .map((e) => tachePlanifiee.safeParse(e))
    .filter((r) => r.success)
    .map((r) => r.data)
    .map((t) => ({ ...t, plateforme: t.plateforme && ids.has(t.plateforme) ? t.plateforme : null }))
    .slice(0, 20);
}

export function datePrevue(t: TachePlanifiee, maintenant: Date) {
  if (t.dans_jours === 0 && t.heure <= maintenant.getHours()) return null; // tout de suite
  const d = new Date(maintenant);
  d.setDate(d.getDate() + t.dans_jours);
  d.setHours(t.heure, 0, 0, 0);
  return d;
}
