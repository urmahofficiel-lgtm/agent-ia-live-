import { createFileRoute } from "@tanstack/react-router";
import { clientMoteur } from "@/lib/supabase-serveur";
import { SITE_BTP, lirePage, pagesFonctionnalites, publicationsNouveaute } from "@/lib/nouveautes";

// Annonce des nouveautés de BTP Ecosystem : appelé chaque matin par pg_cron.
// Une page de fonctionnalité apparue dans le plan du site devient des
// publications « Nouveau : … » (à valider ou planifiées selon les réglages).
// Une seule nouveauté annoncée par jour, pour ne pas inonder les réseaux.

async function lire(url: string) {
  const r = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { "User-Agent": "AgentIALive/1.0" } });
  if (!r.ok) throw new Error(`${new URL(url).pathname} ${r.status}`);
  return r.text();
}

async function annoncer(secret: string) {
  const sb = clientMoteur();
  const { data: comptes, error } = await sb.rpc("agent_comptes_nouveautes", { p_secret: secret });
  if (error) throw new Error(error.message);
  if (!comptes?.length) return { comptes: 0 };
  const pages = pagesFonctionnalites(await lire(`${SITE_BTP}/sitemap.xml`));
  const bilan: Record<string, unknown> = {};
  for (const { user_id, urls } of comptes as { user_id: string; urls: string[] }[]) {
    const deja = new Set(urls ?? []);
    const nouvelles = pages.filter((u) => !deja.has(u));
    if (deja.size === 0) {
      // Première lecture : l'existant est noté comme vu, rien n'est publié.
      for (const u of nouvelles) await sb.rpc("agent_annoncer_nouveaute", { p_secret: secret, p_user: user_id, p_url: u, p_publications: [] });
      bilan[user_id] = { notees: nouvelles.length };
      continue;
    }
    const url = nouvelles[0];
    if (!url) {
      bilan[user_id] = { nouvelles: 0 };
      continue;
    }
    const page = lirePage(url, await lire(url));
    if (!page) {
      // Page illisible : on réessaiera demain (elle n'est pas notée).
      bilan[user_id] = { illisible: url };
      continue;
    }
    const { data, error: e } = await sb.rpc("agent_annoncer_nouveaute", {
      p_secret: secret,
      p_user: user_id,
      p_url: url,
      p_publications: publicationsNouveaute(page),
    });
    if (e) console.warn("nouveautes", user_id, e.message);
    bilan[user_id] = { url, publications: Number(data ?? 0) };
  }
  return { pages: pages.length, bilan };
}

export const Route = createFileRoute("/api/agent/nouveautes")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-agent-secret") ?? "";
        const attendu = process.env.AGENT_TICK_SECRET ?? "";
        if (!attendu || secret !== attendu) return new Response("Non autorisé", { status: 401 });
        try {
          return Response.json({ ok: true, ...(await annoncer(secret)) });
        } catch (e) {
          console.error("nouveautes", e);
          return Response.json({ ok: false, erreur: e instanceof Error ? e.message : "erreur" }, { status: 500 });
        }
      },
    },
  },
});
