import { avecVeille } from "./veille";
import { veilleDuJour } from "./tendances.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { demanderIA } from "./ia.server";
import { lireCanaux } from "./marches";
import { tachesJournee } from "./journee";
import { melangeCroissance, sujetsDeSecours } from "./croissance";
import {
  consigneSujets,
  ferieProche,
  lireSujets,
  melangeDuJour,
  minutesParis,
  normaliserCreneaux,
  planDuJour,
  rythmeCroissance,
  tachesDuJour,
} from "./pilote";

// Passé 6 h 30 (heure de Paris), si l'IA ne donne toujours pas de sujets, on
// planifie des sujets de secours plutôt que de perdre la journée.
const HEURE_SECOURS = 6 * 60 + 30;

// Étape « planification du jour » du moteur (pilote automatique). Légère : au
// plus 2 utilisateurs par passage, un seul appel à l'IA chacun. Une erreur
// (IA indisponible, réponse illisible) ne bloque rien : le jour n'est pas
// marqué planifié, on réessaie au passage suivant.
type APlanifier = {
  user_id: string;
  jour: string;
  rythme: unknown;
  creneaux: string[] | null;
  // Réseau + marché de chaque compte connecté : [{ plateforme, marche }].
  canaux: unknown;
  contexte: string | null;
  titres_recents: string[] | null;
  apprentissage: string | null;
};

// Jours fériés en France (Nager.Date, gratuit, sans clé). Facultatif : null
// en cas d'échec.
async function ferieDuJour(jour: string) {
  try {
    const r = await fetch(
      `https://date.nager.at/api/v3/PublicHolidays/${jour.slice(0, 4)}/FR`,
      { signal: AbortSignal.timeout(5_000) },
    );
    return r.ok ? ferieProche(await r.json(), jour) : null;
  } catch {
    return null;
  }
}

export async function planifierJournees(
  sb: SupabaseClient,
  secret: string,
  echeance: number,
) {
  const { data, error } = await sb.rpc("agent_pilotes_du_jour", {
    p_secret: secret,
  });
  // Fonction absente tant que la migration n'est pas appliquée : on passe.
  if (error) return 0;
  let creees = 0;
  for (const u of (data ?? []) as APlanifier[]) {
    if (Date.now() > echeance - 30_000) break;
    try {
      const canaux = lireCanaux(u.canaux);
      // Mode croissance (Réglages) : piliers « utiles d'abord », rythme plafonné.
      const { data: croissance } = await sb.rpc("agent_croissance", { p_secret: secret, p_user: u.user_id, p_jour: u.jour });
      const enCroissance = croissance === true;
      const plan = planDuJour(
        canaux,
        enCroissance ? rythmeCroissance(u.rythme, canaux.map((c) => c.plateforme)) : u.rythme,
        normaliserCreneaux(u.creneaux),
        u.jour,
      );
      let taches: ReturnType<typeof tachesDuJour> = [];
      if (plan.creneaux.length) {
        const titres = u.titres_recents ?? [];
        const categories: string[] = enCroissance ? melangeCroissance(u.jour, plan.heures.length) : melangeDuJour(u.jour, plan.heures.length);
        // Veille des tendances du domaine (une fois par jour) : les sujets
        // du jour peuvent coller à l'actualité de la clientèle.
        const [ferie, tendances] = await Promise.all([
          ferieDuJour(u.jour),
          veilleDuJour(sb, secret, u.user_id, u.contexte, u.jour, echeance).catch(() => null),
        ]);
        let sujets: ReturnType<typeof lireSujets> = null;
        try {
          // Réponse longue (un sujet par heure) : Gemini d'abord, avec de la
          // place (les modèles « à raisonnement » de NVIDIA coupaient la
          // réponse à 1200 jetons).
          const reponse = await demanderIA(
            consigneSujets({
              contexte: avecVeille(u.contexte),
              tendances,
              categories,
              titresRecents: titres,
              apprentissage: u.apprentissage,
              jour: u.jour,
              ferie,
              croissance: enCroissance,
            }),
            {
              systeme:
                "Tu es responsable éditorial des réseaux sociaux d'une petite entreprise. Tu réponds uniquement en JSON valide.",
              maxTokens: 3000,
              delaiTotal: Math.min(60_000, echeance - Date.now() - 20_000),
            },
          );
          sujets = lireSujets(reponse, plan.heures.length, titres, enCroissance);
        } catch (e) {
          console.warn("Pilote automatique : IA indisponible", e instanceof Error ? e.message : e);
        }
        if (!sujets && minutesParis() >= HEURE_SECOURS) {
          const secours = sujetsDeSecours(plan.heures.length, tendances, titres, u.jour);
          if (secours.length >= plan.heures.length) sujets = secours;
        }
        if (!sujets) throw new Error("réponse de l'IA inutilisable");
        taches = tachesDuJour(plan.creneaux, sujets, categories, enCroissance);
      }
      // Série « Une journée de… » (essai d'une semaine) : l'épisode du jour,
      // en plus des sujets choisis par l'IA.
      taches = [
        ...taches,
        ...tachesJournee(u.jour, canaux, u.rythme, normaliserCreneaux(u.creneaux)),
      ];
      // Sans créneau restant (ou sans réseau), le jour est tout de même marqué
      // planifié : rien à refaire avant demain.
      const { data: n, error: err } = await sb.rpc("agent_planifier_jour", {
        p_secret: secret,
        p_user: u.user_id,
        p_jour: u.jour,
        p_taches: taches,
      });
      if (err) throw new Error(err.message);
      creees += (n as number) ?? 0;
    } catch (e) {
      console.warn(
        "Pilote automatique : planification reportée",
        u.user_id,
        e instanceof Error ? e.message : e,
      );
    }
  }
  return creees;
}
