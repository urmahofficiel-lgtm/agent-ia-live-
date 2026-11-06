import { createFileRoute } from "@tanstack/react-router";
import { clientMoteur } from "@/lib/supabase-serveur";
import { demanderIA } from "@/lib/ia.server";
import { jourParis } from "@/lib/pilote";
import { CONCURRENTS, consigneVeilleConcurrents, empreinte, lireRapport, lireVideos, textePage, type PageLue, type VideoConcurrent } from "@/lib/concurrents";

// Veille concurrents : appelé chaque lundi par pg_cron. Pages d'Obat,
// Batappli et Tolteck (changements depuis la semaine dernière), leurs vidéos
// TikTok via Apify (si APIFY_TOKEN est réglé), puis un rapport et 3 idées
// enregistrés dans le fil de l'agent. Rien n'est publié.

async function lirePage(url: string) {
  const r = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "Mozilla/5.0 (compatible; AgentIALive/1.0)", Accept: "text/html" } });
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return textePage(await r.text());
}

// Vidéos TikTok récentes (10 par compte, environ 0,08 $ par semaine).
async function videosTiktok(): Promise<VideoConcurrent[]> {
  const cle = process.env.APIFY_TOKEN;
  const profils = CONCURRENTS.map((c) => c.tiktok).filter((x): x is string => Boolean(x));
  if (!cle || !profils.length) return [];
  try {
    const r = await fetch("https://api.apify.com/v2/acts/clockworks~tiktok-scraper/run-sync-get-dataset-items?timeout=120&maxTotalChargeUsd=0.5", {
      method: "POST",
      headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(150_000),
      body: JSON.stringify({ profiles: profils, resultsPerPage: 10, profileScrapeSections: ["videos"], profileSorting: "latest", excludePinnedPosts: true }),
    });
    if (!r.ok) {
      console.warn("concurrents apify", r.status);
      return [];
    }
    return lireVideos(await r.json());
  } catch (e) {
    console.warn("concurrents apify", e);
    return [];
  }
}

async function veiller(secret: string) {
  const debut = Date.now();
  const sb = clientMoteur();
  const { data: comptes, error } = await sb.rpc("agent_comptes_veille_concurrents", { p_secret: secret });
  if (error) throw new Error(error.message);
  if (!comptes?.length) return { comptes: 0 };

  const [lues, videos] = await Promise.all([
    Promise.all(
      CONCURRENTS.flatMap((c) => c.pages.map((url) => lirePage(url).then((texte) => ({ concurrent: c.nom, url, texte }), () => null))),
    ),
    videosTiktok(),
  ]);
  const pages = lues.filter((p): p is { concurrent: string; url: string; texte: string } => Boolean(p && p.texte.length > 200));
  const empreintes = Object.fromEntries(pages.map((p) => [p.url, empreinte(p.texte)]));
  const jour = jourParis();
  const depuis = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);

  const bilan: Record<string, unknown> = {};
  for (const { user_id, empreintes_avant } of comptes as { user_id: string; empreintes_avant: Record<string, string> | null }[]) {
    const avant = empreintes_avant ?? {};
    const lu: PageLue[] = pages.map((p) => ({ ...p, changee: Boolean(avant[p.url]) && avant[p.url] !== empreintes[p.url] }));
    const reponse = await demanderIA(consigneVeilleConcurrents(lu, videos, depuis), {
      systeme: "Tu fais la veille concurrentielle d'une petite entreprise. Tu réponds uniquement en JSON valide.",
      maxTokens: 1200,
      delaiTotal: Math.max(30_000, 240_000 - (Date.now() - debut)),
    });
    const r = lireRapport(reponse);
    if (!r) {
      bilan[user_id] = "rapport illisible";
      continue;
    }
    const { error: e } = await sb.rpc("agent_enregistrer_veille_concurrents", {
      p_secret: secret,
      p_user: user_id,
      p_jour: jour,
      p_empreintes: empreintes,
      p_rapport: r.rapport,
      p_idees: r.idees,
      p_videos: videos.length,
    });
    if (e) console.warn("concurrents", user_id, e.message);
    bilan[user_id] = { pages: pages.length, changees: lu.filter((p) => p.changee).length, videos: videos.length };
  }
  return bilan;
}

export const Route = createFileRoute("/api/agent/concurrents")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-agent-secret") ?? "";
        const attendu = process.env.AGENT_TICK_SECRET ?? "";
        if (!attendu || secret !== attendu) return new Response("Non autorisé", { status: 401 });
        try {
          return Response.json({ ok: true, ...(await veiller(secret)) });
        } catch (e) {
          console.error("concurrents", e);
          return Response.json({ ok: false, erreur: e instanceof Error ? e.message : "erreur" }, { status: 500 });
        }
      },
    },
  },
});
