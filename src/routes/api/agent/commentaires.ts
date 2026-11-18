import { createFileRoute } from "@tanstack/react-router";
import { clientMoteur } from "@/lib/supabase-serveur";
import { demanderIA } from "@/lib/ia.server";
import { aimerCommentaire, listerCommentaires, repondreCommentaire } from "@/lib/zernio.server";
import {
  commentairesFacebook,
  commentairesInstagram,
  repondreFacebook,
  repondreInstagram,
} from "@/lib/meta.server";
import { GRAPH_IG } from "@/lib/instagram.server";
import { consigneReponse, LIKE_POSSIBLE, lireDecision } from "@/lib/reponses-commentaires";

// Réponses automatiques aux commentaires : appelé toutes les 20 minutes par
// pg_cron. Pour chaque compte qui l'a activé, l'agent lit les commentaires
// sans réponse, puis like et/ou répond seul (accord de Younes du 01/11/2026).
// Depuis le 18/11/2026 (« commercial automatique »), Instagram et Facebook
// reliés en direct sont couverts aussi, pas seulement les comptes Zernio.
const BUDGET = 200_000;
const PAR_PASSAGE = 10;

type Compte = { user_id: string; profil: string | null; contexte: string | null; deja: string[] | null };
type Direct = { plateforme: string; fournisseur: string; externe: string; pseudo: string | null };

// Un commentaire à traiter, quel que soit le chemin (Zernio ou API Meta).
type ATraiter = {
  id: string;
  plateforme: string;
  auteur: string;
  texte: string;
  post: string;
  aimer: (() => Promise<unknown>) | null;
  repondre: (texte: string) => Promise<unknown>;
};

async function commentairesDirects(secret: string, userId: string, erreurs: string[]): Promise<ATraiter[]> {
  const sb = clientMoteur();
  const { data, error } = await sb.rpc("agent_comptes_directs_auto", { p_secret: secret, p_user: userId });
  if (error) {
    erreurs.push(error.message);
    return [];
  }
  const lots = await Promise.all(
    ((data ?? []) as Direct[]).map(async (d) => {
      try {
        const { data: jeton } = await sb.rpc("compte_jeton", { p_secret: secret, p_user: userId, p_externe: d.externe });
        if (!jeton) return [];
        const j = jeton as string;
        const base = d.fournisseur === "instagram" ? GRAPH_IG : undefined;
        const liste =
          d.plateforme === "facebook"
            ? await commentairesFacebook(d.externe, j)
            : await commentairesInstagram(d.externe, j, d.pseudo, base);
        return liste.map(
          (c): ATraiter => ({
            id: c.id,
            plateforme: d.plateforme,
            auteur: c.auteur,
            texte: c.texte,
            post: c.contexte ?? "",
            // L'API Meta ne permet pas de liker un commentaire au nom d'un compte.
            aimer: null,
            repondre: (t) => (d.plateforme === "facebook" ? repondreFacebook(c.id, j, t) : repondreInstagram(c.id, j, t, base)),
          }),
        );
      } catch (e) {
        erreurs.push(`${d.plateforme} : ${e instanceof Error ? e.message : String(e)}`);
        return [];
      }
    }),
  );
  return lots.flat();
}

async function traiter(secret: string) {
  const debut = Date.now();
  const sb = clientMoteur();
  const { data, error } = await sb.rpc("agent_reponses_auto", { p_secret: secret });
  if (error) throw new Error(error.message);
  const bilan = { lus: 0, reponses: 0, likes: 0, ignores: 0, aValider: 0, echecs: 0, lecture: [] as string[], ia: [] as string[] };
  for (const compte of (data ?? []) as Compte[]) {
    const deja = new Set(compte.deja ?? []);
    const directs = await commentairesDirects(secret, compte.user_id, bilan.lecture);
    const enDirect = new Set(directs.map((d) => d.plateforme));
    const viaZernio: ATraiter[] = compte.profil
      ? (
          await listerCommentaires(compte.profil).catch((e) => {
            bilan.lecture.push(e instanceof Error ? e.message : String(e));
            return [];
          })
        )
          // Un réseau relié en direct est lu en direct : jamais deux réponses.
          .filter((c) => !enDirect.has(c.platform))
          .map((c) => ({
            id: c.id,
            plateforme: c.platform,
            auteur: c.from?.username || c.from?.name || "quelqu'un",
            texte: c.message,
            post: c.post,
            aimer: LIKE_POSSIBLE.has(c.platform) ? () => aimerCommentaire(c.postId, c.accountId, c.id) : null,
            repondre: (t: string) => repondreCommentaire(c.postId, c.accountId, c.id, t),
          }))
      : [];
    const nouveaux = [...directs, ...viaZernio]
      .filter((c) => !deja.has(c.id) && c.texte?.trim())
      .slice(0, PAR_PASSAGE);
    for (const c of nouveaux) {
      if (Date.now() - debut > BUDGET) break;
      bilan.lus++;
      const auteur = c.auteur;
      const noter = (action: string, reponse: string | null) =>
        sb.rpc("agent_commentaire_traite", {
          p_secret: secret,
          p_user: compte.user_id,
          p_commentaire: c.id,
          p_plateforme: c.plateforme,
          p_action: action,
          p_auteur: auteur,
          p_texte: c.texte,
          p_reponse: reponse,
        });
      // IA lente ou saturée : rien n'est noté, nouvel essai au passage suivant.
      const brut = await demanderIA(consigneReponse({ plateforme: c.plateforme, auteur, texte: c.texte, post: c.post }, compte.contexte), {
        maxTokens: 300,
        // Temps restant du passage (NVIDIA souvent lent : Gemini d'abord).
        delaiTotal: Math.max(30_000, Math.min(170_000, BUDGET - (Date.now() - debut))),
        gemini: "d'abord",
      }).catch((e) => {
        bilan.ia.push(e instanceof Error ? e.message : String(e));
        return null;
      });
      if (brut === null) continue;
      try {
        const decision = lireDecision(brut);
        // Like impossible sur ce réseau : rien à faire.
        if (decision.action === "liker" && !c.aimer) decision.action = "ignorer";
        // Question précise : rien n'est publié, la réponse proposée attend
        // l'utilisateur dans le journal.
        if (decision.action === "a_valider") {
          bilan.aValider++;
          await noter("a_valider", decision.texte || null);
          continue;
        }
        if (decision.action === "ignorer") {
          bilan.ignores++;
          await noter("ignorer", null);
          continue;
        }
        if (c.aimer) {
          const aime = await c.aimer().then(
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
          await c.repondre(decision.texte);
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
