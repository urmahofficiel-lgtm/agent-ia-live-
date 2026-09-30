import { createFileRoute } from "@tanstack/react-router";
import { clientMoteur } from "@/lib/supabase-serveur";
import { lireStatsPost, type PostPublie } from "@/lib/stats.server";
import { calculerApprentissage, type PubliStat } from "@/lib/statistiques";

// Statistiques + apprentissage : appelé toutes les heures par pg_cron.
// 1. Relit les stats des publications des 30 derniers jours (lecture seule).
// 2. Recalcule, par utilisateur, le résumé de ce qui marche
//    (reglages_agent.apprentissage), lu par la rédaction et le planificateur.
const BUDGET = 150_000; // + un dernier lot (≤ 75 s) : reste sous 250 s
const LOT = 4; // posts lus en parallèle

async function statistiques(secret: string) {
  const debut = Date.now();
  const sb = clientMoteur();

  const { data, error } = await sb.rpc("agent_stats_a_faire", { p_secret: secret, p_limite: 200 });
  if (error) throw new Error(error.message);
  const posts = (data ?? []) as PostPublie[];

  // Un jeton par compte, lu une seule fois.
  const jetons = new Map<string, Promise<string | null>>();
  const jeton = (p: PostPublie) => () => {
    const cle = `${p.user_id}:${p.compte_externe_id}`;
    if (!jetons.has(cle)) {
      jetons.set(
        cle,
        p.compte_externe_id
          ? Promise.resolve(sb.rpc("compte_jeton", { p_secret: secret, p_user: p.user_id, p_externe: p.compte_externe_id })).then(({ data: j }) => (j as string | null) ?? null)
          : Promise.resolve(null),
      );
    }
    return jetons.get(cle)!;
  };

  let lus = 0;
  let erreurs = 0;
  for (let i = 0; i < posts.length && Date.now() - debut < BUDGET; i += LOT) {
    await Promise.all(
      posts.slice(i, i + LOT).map(async (p) => {
        const lecture = await lireStatsPost(p, jeton(p));
        if (lecture === "attente") return;
        const maj = new Date().toISOString();
        // En cas d'erreur, on garde les dernières valeurs connues.
        const stats = "stats" in lecture ? { ...lecture.stats, maj, erreur: null } : { maj, erreur: lecture.erreur };
        if ("erreur" in lecture) erreurs++;
        else lus++;
        const { error: e } = await sb.rpc("agent_enregistrer_stats", { p_secret: secret, p_tache_id: p.tache_id, p_stats: stats });
        if (e) console.warn("stats", p.tache_id, e.message);
      }),
    );
  }

  // 2. Apprentissage, pour chaque utilisateur ayant des publications mesurées.
  const { data: pubs, error: errPubs } = await sb.rpc("agent_publications_stats", { p_secret: secret });
  if (errPubs) throw new Error(errPubs.message);
  const parUtilisateur = new Map<string, PubliStat[]>();
  for (const p of (pubs ?? []) as (PubliStat & { user_id: string })[]) {
    parUtilisateur.set(p.user_id, [...(parUtilisateur.get(p.user_id) ?? []), p]);
  }
  let resumes = 0;
  for (const [userId, liste] of parUtilisateur) {
    const apprentissage = calculerApprentissage(liste);
    if (!apprentissage) continue;
    const { error: e } = await sb.rpc("agent_enregistrer_apprentissage", { p_secret: secret, p_user: userId, p_apprentissage: apprentissage });
    if (e) console.warn("apprentissage", userId, e.message);
    else resumes++;
  }

  return { a_lire: posts.length, lus, erreurs, resumes };
}

export const Route = createFileRoute("/api/agent/stats")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-agent-secret") ?? "";
        const attendu = process.env.AGENT_TICK_SECRET ?? "";
        if (!attendu || secret !== attendu) return new Response("Non autorisé", { status: 401 });
        try {
          return Response.json({ ok: true, ...(await statistiques(secret)) });
        } catch (e) {
          console.error("stats", e);
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
