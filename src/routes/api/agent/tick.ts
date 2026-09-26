import { createFileRoute } from "@tanstack/react-router";
import { PLATEFORMES } from "@/lib/plateformes";
import { rediger } from "@/lib/ia.server";
import { clientMoteur } from "@/lib/supabase-serveur";
import { publier } from "@/lib/zernio.server";

// Moteur de l'agent : appelé toutes les 5 minutes par pg_cron (Supabase).
// Il rédige puis publie les tâches validées dont l'heure est venue, même
// quand personne n'a le site ouvert.
type Due = {
  tache_id: string;
  plateforme: string | null;
  titre: string;
  consigne: string;
  brouillon: string | null;
  compte_externe_id: string | null;
};

async function tick(secret: string) {
  const sb = clientMoteur();
  const { data, error } = await sb.rpc("agent_taches_dues", { p_secret: secret });
  if (error) throw new Error(error.message);

  const maj = (id: string, statut: string | null, resultat: object | null, niveau: string, msg: string) =>
    sb.rpc("agent_maj_tache", {
      p_secret: secret,
      p_tache_id: id,
      p_statut: statut,
      p_resultat: resultat,
      p_niveau: niveau,
      p_message: msg,
    });

  let traitees = 0;
  for (const t of (data ?? []) as Due[]) {
    const zernio = PLATEFORMES.find((p) => p.id === t.plateforme)?.zernio;
    if (!zernio || !t.compte_externe_id) {
      await maj(t.tache_id, "echouee", null, "erreur", `« ${t.titre} » : réseau non connecté, publication impossible.`);
      continue;
    }
    try {
      await maj(t.tache_id, "en_cours", null, "action", `L'agent traite « ${t.titre} »`);
      let texte = t.brouillon;
      if (!texte) {
        texte = await rediger({ type: "publication", plateforme: t.plateforme, titre: t.titre, consigne: t.consigne });
        await maj(t.tache_id, null, { brouillon: texte }, "info", `Contenu rédigé pour « ${t.titre} »`);
      }
      const post = await publier(zernio, t.compte_externe_id, texte);
      await maj(t.tache_id, "terminee", { post_id: post._id, publie_le: new Date().toISOString() }, "info", `Publié : « ${t.titre} »`);
      traitees++;
    } catch (e) {
      await maj(t.tache_id, "echouee", null, "erreur", `Échec sur « ${t.titre} » : ${e instanceof Error ? e.message : "erreur"}`);
    }
  }

  // Brouillons à préparer (tâches créées par une commande, par exemple).
  const { data: aRediger } = await sb.rpc("agent_brouillons_a_faire", { p_secret: secret });
  for (const t of (aRediger ?? []) as { tache_id: string; type: string; plateforme: string | null; titre: string; consigne: string }[]) {
    try {
      const brouillon = await rediger(t);
      await maj(t.tache_id, null, { brouillon, genere_le: new Date().toISOString() }, "info", `Brouillon prêt pour « ${t.titre} » — à valider.`);
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
