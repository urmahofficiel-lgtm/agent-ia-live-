import { createFileRoute } from "@tanstack/react-router";
import { clientMoteur } from "@/lib/supabase-serveur";
import { veilleDuJour } from "@/lib/tendances.server";

// Veille des tendances à la demande (moteur, secret requis) pour un compte :
// la même que celle faite chaque matin avant la planification du pilote.
// Corps : { user, contexte, jour? }.
export const Route = createFileRoute("/api/agent/veille")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const attendu = process.env.AGENT_TICK_SECRET ?? "";
        const secret = request.headers.get("x-agent-secret") ?? "";
        if (!attendu || secret !== attendu) return new Response("Non autorisé", { status: 401 });
        const corps = (await request.json().catch(() => ({}))) as { user?: string; contexte?: string; jour?: string };
        if (!corps.user || !corps.contexte) return Response.json({ ok: false, erreur: "user et contexte requis" }, { status: 400 });
        const jour = corps.jour ?? new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
        try {
          const resume = await veilleDuJour(clientMoteur(), secret, corps.user, corps.contexte, jour, Date.now() + 200_000);
          return Response.json({ ok: Boolean(resume), jour, resume });
        } catch (e) {
          return Response.json({ ok: false, erreur: e instanceof Error ? e.message : String(e) });
        }
      },
    },
  },
});
