import { createFileRoute } from "@tanstack/react-router";
import { clientMoteur } from "@/lib/supabase-serveur";
import { demanderIA } from "@/lib/ia.server";
import { instantParis, jourParis } from "@/lib/pilote";
import { choisirSujet, consigneFiche, consignePublication, lireFiche, requetesSujet } from "@/lib/histoires";
import { rechercherPlusieurs } from "@/lib/histoire.server";

// Agent « Histoires du jour » : appelé chaque matin par pg_cron. Choisit une
// grande construction jamais racontée, fait les recherches web, écrit une
// fiche de faits sourcés, puis crée la publication TikTok du soir (vidéo
// « Histoire » en papier découpé, faite ensuite par le moteur).

async function preparer(secret: string) {
  const debut = Date.now();
  const sb = clientMoteur();
  const jour = jourParis();
  const { data: comptes, error } = await sb.rpc("agent_comptes_histoires", { p_secret: secret, p_jour: jour });
  if (error) throw new Error(error.message);
  const bilan: Record<string, unknown> = {};
  for (const c of (comptes ?? []) as { user_id: string; deja: string[]; fait_aujourdhui: boolean }[]) {
    if (c.fait_aujourdhui) {
      bilan[c.user_id] = "déjà fait aujourd'hui";
      continue;
    }
    const sujet = choisirSujet(c.deja ?? []);
    if (!sujet) {
      bilan[c.user_id] = "liste de sujets épuisée";
      continue;
    }
    const sources = await rechercherPlusieurs(requetesSujet(sujet));
    if (sources.length < 3) {
      bilan[c.user_id] = `${sujet.cle} : trop peu de sources (${sources.length})`;
      continue;
    }
    const textes = sources.map((s) => `${s.titre} ${s.texte}`).join("\n");
    const fiche = lireFiche(
      await demanderIA(consigneFiche(sujet, sources), {
        systeme: "Tu es documentaliste spécialisé dans l'histoire de la construction. Tu réponds uniquement en JSON valide.",
        maxTokens: 1500,
        delaiTotal: Math.max(40_000, 200_000 - (Date.now() - debut)),
        gemini: "secours",
      }),
      sujet,
      textes,
    );
    if (!fiche) {
      bilan[c.user_id] = `${sujet.cle} : fiche trop pauvre ou illisible`;
      continue;
    }
    const { data: tache, error: e } = await sb.rpc("agent_enregistrer_histoire", {
      p_secret: secret,
      p_user: c.user_id,
      p_jour: jour,
      p_cle: sujet.cle,
      p_sujet: sujet.nom,
      p_fiche: fiche,
      p_sources: sources.map((s) => ({ titre: s.titre, url: s.url })),
      p_titre: `Histoire : ${sujet.nom}`,
      p_consigne: consignePublication(sujet, fiche, sources),
      p_planifiee_pour: instantParis(jour, "18:30").toISOString(),
    });
    bilan[c.user_id] = e ? `erreur : ${e.message}` : { sujet: sujet.cle, sources: sources.length, tache };
  }
  return bilan;
}

export const Route = createFileRoute("/api/agent/histoires")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-agent-secret") ?? "";
        const attendu = process.env.AGENT_TICK_SECRET ?? "";
        if (!attendu || secret !== attendu) return new Response("Non autorisé", { status: 401 });
        try {
          return Response.json({ ok: true, ...(await preparer(secret)) });
        } catch (e) {
          console.error("histoires", e);
          return Response.json({ ok: false, erreur: e instanceof Error ? e.message : "erreur" }, { status: 500 });
        }
      },
    },
  },
});
