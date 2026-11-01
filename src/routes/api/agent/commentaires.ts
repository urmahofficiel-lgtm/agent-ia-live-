import { createFileRoute } from "@tanstack/react-router";
import { clientMoteur } from "@/lib/supabase-serveur";
import { demanderIA } from "@/lib/ia.server";
import { aimerCommentaire, listerCommentaires, repondreCommentaire } from "@/lib/zernio.server";
import { consigneReponse, LIKE_POSSIBLE, lireDecision } from "@/lib/reponses-commentaires";

// Réponses automatiques aux commentaires : appelé toutes les 20 minutes par
// pg_cron. Pour chaque compte qui l'a activé, l'agent lit les commentaires
// sans réponse, puis like et/ou répond seul (accord de Younes du 01/11/2026).
const BUDGET = 200_000;
const PAR_PASSAGE = 10;

type Compte = { user_id: string; profil: string; contexte: string | null; deja: string[] | null };

async function traiter(secret: string) {
  const debut = Date.now();
  const sb = clientMoteur();
  const { data, error } = await sb.rpc("agent_reponses_auto", { p_secret: secret });
  if (error) throw new Error(error.message);
  const bilan = { lus: 0, reponses: 0, likes: 0, ignores: 0, echecs: 0, lecture: [] as string[], ia: [] as string[] };
  for (const compte of (data ?? []) as Compte[]) {
    const deja = new Set(compte.deja ?? []);
    const nouveaux = (
      await listerCommentaires(compte.profil).catch((e) => {
        bilan.lecture.push(e instanceof Error ? e.message : String(e));
        return [];
      })
    )
      .filter((c) => !deja.has(c.id) && c.message?.trim())
      .slice(0, PAR_PASSAGE);
    for (const c of nouveaux) {
      if (Date.now() - debut > BUDGET) break;
      bilan.lus++;
      const auteur = c.from?.username || c.from?.name || "quelqu'un";
      const noter = (action: string, reponse: string | null) =>
        sb.rpc("agent_commentaire_traite", {
          p_secret: secret,
          p_user: compte.user_id,
          p_commentaire: c.id,
          p_plateforme: c.platform,
          p_action: action,
          p_auteur: auteur,
          p_texte: c.message,
          p_reponse: reponse,
        });
      // IA lente ou saturée : rien n'est noté, nouvel essai au passage suivant.
      const brut = await demanderIA(consigneReponse({ plateforme: c.platform, auteur, texte: c.message, post: c.post }, compte.contexte), {
        maxTokens: 300,
        delaiTotal: 90_000,
      }).catch((e) => {
        bilan.ia.push(e instanceof Error ? e.message : String(e));
        return null;
      });
      if (brut === null) continue;
      try {
        const decision = lireDecision(brut);
        // Like impossible sur ce réseau : rien à faire.
        if (decision.action === "liker" && !LIKE_POSSIBLE.has(c.platform)) decision.action = "ignorer";
        if (decision.action === "ignorer") {
          bilan.ignores++;
          await noter("ignorer", null);
          continue;
        }
        if (LIKE_POSSIBLE.has(c.platform)) {
          const aime = await aimerCommentaire(c.postId, c.accountId, c.id).then(
            () => true,
            (e) => (console.warn("like", c.id, e), false),
          );
          // Like refusé et rien d'autre à faire : noté comme ignoré.
          if (decision.action === "liker" && !aime) {
            bilan.ignores++;
            await noter("ignorer", null);
            continue;
          }
          if (decision.action === "liker") bilan.likes++;
        }
        if (decision.action === "repondre") {
          await repondreCommentaire(c.postId, c.accountId, c.id, decision.texte);
          bilan.reponses++;
        }
        await noter(decision.action, decision.texte || null);
      } catch (e) {
        // Refus du réseau : noté en échec, pas de nouvel essai à chaque passage.
        bilan.echecs++;
        const m = e instanceof Error ? e.message : String(e);
        console.warn("commentaire", c.id, m);
        await noter("echec", m.slice(0, 300));
      }
    }
  }
  return bilan;
}

export const Route = createFileRoute("/api/agent/commentaires")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-agent-secret") ?? "";
        const attendu = process.env.AGENT_TICK_SECRET ?? "";
        if (!attendu || secret !== attendu) return new Response("Non autorisé", { status: 401 });
        try {
          return Response.json({ ok: true, ...(await traiter(secret)) });
        } catch (e) {
          console.error("commentaires", e);
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
