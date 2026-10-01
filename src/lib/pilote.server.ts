import type { SupabaseClient } from "@supabase/supabase-js";
import { demanderIA } from "./ia.server";
import {
  consigneSujets,
  ferieProche,
  lireSujets,
  melangeDuJour,
  normaliserCreneaux,
  planDuJour,
  tachesDuJour,
} from "./pilote";

// Étape « planification du jour » du moteur (pilote automatique). Légère : au
// plus 2 utilisateurs par passage, un seul appel à l'IA chacun. Une erreur
// (IA indisponible, réponse illisible) ne bloque rien : le jour n'est pas
// marqué planifié, on réessaie au passage suivant.
type APlanifier = {
  user_id: string;
  jour: string;
  rythme: unknown;
  creneaux: string[] | null;
  plateformes: string[] | null;
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
  const { data, error } = await sb.rpc("agent_pilotes_a_planifier", {
    p_secret: secret,
  });
  // Fonction absente tant que la migration n'est pas appliquée : on passe.
  if (error) return 0;
  let creees = 0;
  for (const u of (data ?? []) as APlanifier[]) {
    if (Date.now() > echeance - 30_000) break;
    try {
      const plan = planDuJour(
        u.plateformes ?? [],
        u.rythme,
        normaliserCreneaux(u.creneaux),
        u.jour,
      );
      let taches: ReturnType<typeof tachesDuJour> = [];
      if (plan.creneaux.length) {
        const titres = u.titres_recents ?? [];
        const categories = melangeDuJour(u.jour, plan.heures.length);
        const ferie = await ferieDuJour(u.jour);
        const reponse = await demanderIA(
          consigneSujets({
            contexte: u.contexte,
            categories,
            titresRecents: titres,
            apprentissage: u.apprentissage,
            jour: u.jour,
            ferie,
          }),
          {
            systeme:
              "Tu es responsable éditorial des réseaux sociaux d'une petite entreprise. Tu réponds uniquement en JSON valide.",
            maxTokens: 1200,
            delaiTotal: Math.min(60_000, echeance - Date.now() - 20_000),
          },
        );
        const sujets = lireSujets(reponse, plan.heures.length, titres);
        if (!sujets) throw new Error("réponse de l'IA inutilisable");
        taches = tachesDuJour(plan.creneaux, sujets, categories);
      }
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
