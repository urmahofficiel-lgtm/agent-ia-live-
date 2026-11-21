import { createFileRoute } from "@tanstack/react-router";
import { clientMoteur } from "@/lib/supabase-serveur";
import { reveillerRobotRendu } from "@/lib/robot-rendu.server";

// Agent « Contrôleur vidéos » : appelé toutes les 20 minutes par pg_cron. La
// base relance les vidéos ratées (3 fois au plus) ; ici, on réveille le robot
// de rendu si des vidéos l'attendent et on relance l'histoire du jour si elle
// manque. Rien n'est publié.
type Bilan = { relancees: number; coincees: number; abandons: number; histoire_manquante: boolean };

export const Route = createFileRoute("/api/agent/controle-videos")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-agent-secret") ?? "";
        const attendu = process.env.AGENT_TICK_SECRET ?? "";
        if (!attendu || secret !== attendu) return new Response("Non autorisé", { status: 401 });
        try {
          const { data, error } = await clientMoteur().rpc("agent_controle_videos", { p_secret: secret });
          if (error) throw new Error(error.message);
          const b = data as Bilan;
          const actions: string[] = [];
          if (b.coincees > 0) {
            await reveillerRobotRendu().then(
              () => actions.push("robot réveillé"),
              (e) => actions.push(`robot : ${e instanceof Error ? e.message : "erreur"}`),
            );
          }
          if (b.histoire_manquante) {
            // Même passage que celui du matin (il ne refait rien si l'histoire existe déjà).
            const r = await fetch(new URL("/api/agent/histoires", request.url), {
              method: "POST",
              headers: { "x-agent-secret": secret, "content-type": "application/json" },
              body: "{}",
              signal: AbortSignal.timeout(250_000),
            }).catch(() => null);
            actions.push(`histoire relancée (${r?.status ?? "sans réponse"})`);
          }
          return Response.json({ ok: true, ...b, actions });
        } catch (e) {
          console.error("controle-videos", e);
          return Response.json({ ok: false, erreur: e instanceof Error ? e.message : "erreur" }, { status: 500 });
        }
      },
    },
  },
});
