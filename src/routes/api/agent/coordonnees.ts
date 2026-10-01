import { createFileRoute } from "@tanstack/react-router";
import { clientMoteur } from "@/lib/supabase-serveur";
import {
  trouverCoordonnees,
  type ProspectACompleter,
} from "@/lib/coordonnees.server";

// Coordonnées des prospects : appelé toutes les 10 minutes par pg_cron.
// Cherche le téléphone (et l'e-mail) des prospects qui n'en ont pas, par
// petits lots. Rien n'est envoyé à personne : on complète seulement la fiche.
const BUDGET = 180_000;
const LOT = 1; // une recherche à la fois : quotas par minute de Gemini

async function completer(secret: string) {
  const debut = Date.now();
  const sb = clientMoteur();
  const { data, error } = await sb.rpc("agent_prospects_a_completer", {
    p_secret: secret,
    p_limite: 6,
  });
  if (error) throw new Error(error.message);
  const liste = (data ?? []) as (ProspectACompleter & { user_id: string })[];
  let trouves = 0;
  let reportes = 0;
  for (let i = 0; i < liste.length && Date.now() - debut < BUDGET; i += LOT) {
    await Promise.all(
      liste.slice(i, i + LOT).map(async (p) => {
        const c = await trouverCoordonnees(p).catch(() => "plus_tard" as const);
        if (c === "plus_tard") {
          reportes++;
          return;
        }
        if (c.telephone) trouves++;
        const { error: e } = await sb.rpc("agent_enregistrer_coordonnees", {
          p_secret: secret,
          p_id: p.id,
          p_telephone: c.telephone,
          p_email: c.email,
          p_site: c.site,
          p_source: c.source,
        });
        if (e) console.warn("coordonnees", p.id, e.message);
      }),
    );
  }
  return { a_completer: liste.length, trouves, reportes };
}

export const Route = createFileRoute("/api/agent/coordonnees")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-agent-secret") ?? "";
        const attendu = process.env.AGENT_TICK_SECRET ?? "";
        if (!attendu || secret !== attendu)
          return new Response("Non autorisé", { status: 401 });
        try {
          return Response.json({ ok: true, ...(await completer(secret)) });
        } catch (e) {
          console.error("coordonnees", e);
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
