import { createFileRoute } from "@tanstack/react-router";
import { PLATEFORMES } from "@/lib/plateformes";
import { publierSur } from "@/lib/publication.server";
import { preparer, type Ecrivain } from "@/lib/preparation.server";
import { clientMoteur } from "@/lib/supabase-serveur";

// Moteur de l'agent : appelé toutes les 5 minutes par pg_cron (Supabase).
// 1. Publie les tâches validées dont l'heure est venue (texte + visuel).
// 2. Prépare les brouillons manquants (texte + visuel) pour validation.
// Chaque étape est racontée dans le journal « en direct ».
type Due = {
  tache_id: string;
  user_id: string;
  plateforme: string | null;
  titre: string;
  consigne: string;
  brouillon: string | null;
  visuel_url: string | null;
  video_url: string | null;
  compte_externe_id: string | null;
  cible_urn: string | null;
  fournisseur: string | null;
  contexte: string | null;
};

type ARediger = { tache_id: string; type: string; plateforme: string | null; titre: string; consigne: string; contexte: string | null; brouillon: string | null };

async function tick(secret: string) {
  const sb = clientMoteur();

  const maj = (id: string, statut: string | null, resultat: object | null, niveau: string, msg: string | null) =>
    sb.rpc("agent_maj_tache", { p_secret: secret, p_tache_id: id, p_statut: statut, p_resultat: resultat, p_niveau: niveau, p_message: msg });

  const ecrivainMoteur = (tacheId: string): Ecrivain => ({
    journal: (niveau, msg, image) => maj(tacheId, null, image ? { visuel_url: image } : null, niveau, msg),
    enregistrer: (partiel) => maj(tacheId, null, partiel, "info", null),
    ajouterVisuel: async (mime, donnees, prompt) => {
      const { data, error } = await sb.rpc("agent_ajouter_visuel", {
        p_secret: secret,
        p_tache_id: tacheId,
        p_mime: mime,
        p_donnees: donnees,
        p_prompt: prompt,
      });
      if (error || !data) throw new Error(error?.message ?? "Enregistrement de l'image impossible.");
      return data as string;
    },
  });

  // 1. Publications à l'heure.
  const { data, error } = await sb.rpc("agent_taches_dues", { p_secret: secret });
  if (error) throw new Error(error.message);
  let traitees = 0;
  for (const t of (data ?? []) as Due[]) {
    if (!t.plateforme || !t.compte_externe_id) {
      await maj(t.tache_id, "echouee", null, "erreur", `« ${t.titre} » : réseau non connecté, publication impossible.`);
      continue;
    }
    try {
      await maj(t.tache_id, "en_cours", null, "action", `🤖 L'agent prend en charge « ${t.titre} »`);
      const pret = await preparer(
        { type: "publication", plateforme: t.plateforme, titre: t.titre, consigne: t.consigne, brouillon: t.brouillon, visuel_url: t.visuel_url },
        t.contexte,
        ecrivainMoteur(t.tache_id),
      );
      await maj(t.tache_id, null, null, "action", `🚀 Publication sur ${PLATEFORMES.find((p) => p.id === t.plateforme)?.nom}…`);
      const media = t.video_url
        ? ({ type: "video", url: t.video_url } as const)
        : pret.visuel_url
          ? ({ type: "image", url: pret.visuel_url } as const)
          : null;
      const postId = await publierSur(t.plateforme, t.user_id, { fournisseur: t.fournisseur, compte_externe_id: t.compte_externe_id, cible_urn: t.cible_urn }, pret.brouillon, media);
      await maj(t.tache_id, "terminee", { post_id: postId, publie_le: new Date().toISOString() }, "info", `✅ Publié : « ${t.titre} »`);
      traitees++;
    } catch (e) {
      await maj(t.tache_id, "echouee", null, "erreur", `Échec sur « ${t.titre} » : ${e instanceof Error ? e.message : "erreur"}`);
    }
  }

  // 2. Brouillons à préparer (tâches créées par une commande ou la stratégie).
  const { data: aRediger } = await sb.rpc("agent_brouillons_a_faire", { p_secret: secret });
  for (const t of (aRediger ?? []) as ARediger[]) {
    try {
      await preparer({ type: t.type, plateforme: t.plateforme, titre: t.titre, consigne: t.consigne, brouillon: t.brouillon }, t.contexte, ecrivainMoteur(t.tache_id));
      await maj(t.tache_id, null, null, "info", `Prêt à valider : « ${t.titre} »`);
    } catch (e) {
      await maj(t.tache_id, null, { essais_brouillon: 3 }, "erreur", `Rédaction impossible pour « ${t.titre} » : ${e instanceof Error ? e.message : "erreur"}`);
    }
  }

  return traitees;
}

export const Route = createFileRoute("/api/agent/tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-agent-secret") ?? "";
        const attendu = process.env.AGENT_TICK_SECRET ?? "";
        if (!attendu || secret !== attendu) return new Response("Non autorisé", { status: 401 });
        try {
          const traitees = await tick(secret);
          return Response.json({ ok: true, traitees });
        } catch (e) {
          console.error("tick", e);
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
