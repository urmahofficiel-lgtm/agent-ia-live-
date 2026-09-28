import { createFileRoute } from "@tanstack/react-router";
import { MODELES_ANIMATION, type ModeAnimation } from "@/lib/animation";
import { jetonWebhookValide, resultatRequete } from "@/lib/fal.server";
import { clientMoteur } from "@/lib/supabase-serveur";

// Webhook fal.ai : prévenu à la fin d'une génération. On vérifie le jeton de
// l'adresse, puis on relit le résultat chez fal.ai avec notre clé (le corps
// reçu n'est jamais pris tel quel). La copie durable de la vidéo est faite
// ensuite par la page de l'utilisateur (voir suivreAnimation).
export const Route = createFileRoute("/api/animations/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const q = new URL(request.url).searchParams;
        const id = q.get("id") ?? "";
        const mode = q.get("m") as ModeAnimation | null;
        if (!/^[0-9a-f-]{36}$/.test(id) || !mode || !(mode in MODELES_ANIMATION) || !jetonWebhookValide(id, q.get("jeton") ?? "")) {
          return new Response("Non autorisé", { status: 401 });
        }
        const corps = (await request.json().catch(() => ({}))) as { request_id?: string };
        if (!corps.request_id) return new Response("Requête invalide", { status: 400 });

        let statut = "terminee";
        let source: string | null = null;
        let erreur: string | null = null;
        try {
          source = (await resultatRequete(MODELES_ANIMATION[mode].id, corps.request_id)).video?.url ?? null;
          if (!source) throw new Error("Vidéo absente de la réponse du modèle.");
        } catch (e) {
          statut = "echouee";
          erreur = e instanceof Error ? e.message : "Échec de l'animation.";
        }
        await clientMoteur().rpc("animation_maj", {
          p_secret: process.env.AGENT_TICK_SECRET ?? "",
          p_id: id,
          p_statut: statut,
          p_source: source,
          p_erreur: erreur,
        });
        // Toujours 200 : fal.ai n'a pas à renvoyer la notification.
        return Response.json({ ok: true });
      },
    },
  },
});
