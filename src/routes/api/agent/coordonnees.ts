import { createFileRoute } from "@tanstack/react-router";
import { clientMoteur } from "@/lib/supabase-serveur";
import {
  dernierRefusRecherche,
  trouverCoordonnees,
  type ProspectACompleter,
} from "@/lib/coordonnees.server";

// Coordonnées des prospects : appelé toutes les heures de 7 h à 20 h par
// pg_cron. Le site connu d'un prospect est lu sans compter ; la recherche web
// est limitée à 6 prospects par passage (choix de Younes le 31/10/2026 ;
// l'offre gratuite Tavily compte 1 000 recherches par mois).
// Cherche le téléphone (et l'e-mail) des prospects qui n'en ont pas, par
// petits lots. Rien n'est envoyé à personne : on complète seulement la fiche.
const BUDGET = 180_000;
const LOT = 4;
const RECHERCHES_WEB = 6;
const PAR_PASSAGE = 12;

async function completer(secret: string, limite = PAR_PASSAGE) {
  const debut = Date.now();
  const sb = clientMoteur();
  const { data, error } = await sb.rpc("agent_coordonnees_a_chercher", {
    p_secret: secret,
    p_limite: limite,
  });
  if (error) throw new Error(error.message);
  const liste = (data ?? []) as (ProspectACompleter & { user_id: string })[];
  let trouves = 0;
  let reportes = 0;
  // Recherche web : les prospects sans site d'abord, dans la limite du passage.
  let web = RECHERCHES_WEB;
  const avecWeb = new Set(liste.filter((p) => !p.site).slice(0, web).map((p) => p.id));
  web -= avecWeb.size;
  for (let i = 0; i < liste.length && Date.now() - debut < BUDGET; i += LOT) {
    await Promise.all(
      liste.slice(i, i + LOT).map(async (p) => {
        let c = await trouverCoordonnees(p, avecWeb.has(p.id)).catch(() => "plus_tard" as const);
        // Site sans résultat : recherche web s'il en reste pour ce passage.
        if (c === "plus_tard" && p.site && web > 0) {
          web--;
          c = await trouverCoordonnees(p).catch(() => "plus_tard" as const);
        }
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
  return {
    a_completer: liste.length,
    trouves,
    reportes,
    // Recherche web : clé reçue par le serveur (jamais sa valeur).
    recherche_web: Boolean(process.env.TAVILY_API_KEY),
    refus_recherche: dernierRefusRecherche,
  };
}

// Lot à la demande : { limite: 1 à 20 } (par défaut 12 ; le planning envoie 2,
// relevé à 12 : seule la recherche web est limitée).
const lireLimite = (corps: unknown) => {
  const n = Number((corps as { limite?: unknown } | null)?.limite);
  return Number.isInteger(n) && n >= 1 && n <= 20 ? Math.max(n, PAR_PASSAGE) : PAR_PASSAGE;
};

export const Route = createFileRoute("/api/agent/coordonnees")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-agent-secret") ?? "";
        const attendu = process.env.AGENT_TICK_SECRET ?? "";
        if (!attendu || secret !== attendu)
          return new Response("Non autorisé", { status: 401 });
        try {
          return Response.json({
            ok: true,
            ...(await completer(
              secret,
              lireLimite(await request.json().catch(() => null)),
            )),
          });
        } catch (e) {
          console.error("coordonnees", e);
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
