import { createFileRoute } from "@tanstack/react-router";
import { clientMoteur } from "@/lib/supabase-serveur";
import { infosMarche, lireAttributions, lireEntreprise, urlAttributions, urlEntreprise, type Attribution } from "@/lib/marches-publics";

// Prospection « marchés publics » : appelé chaque matin par pg_cron. Les
// entreprises du BTP qui viennent de remporter un marché de travaux (BOAMP)
// sont retrouvées dans l'annuaire officiel puis ajoutées aux prospects.
// Rien n'est envoyé ici : l'agent e-mail les contacte ensuite, comme les autres.
const PAR_JOUR = 15;
const BUDGET = 200_000;

async function json(url: string) {
  const r = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  return r.json();
}

async function trouver(attributions: Attribution[], debut: number) {
  const trouves: { nom: string; adresse: string | null; siret: string; infos: string; departement: string }[] = [];
  for (let i = 0; i < attributions.length && trouves.length < PAR_JOUR && Date.now() - debut < BUDGET; i += 4) {
    const lot = await Promise.all(
      attributions.slice(i, i + 4).map(async (a) => {
        const e = lireEntreprise(await json(urlEntreprise(a.titulaire, a.departement)).catch(() => null));
        return e ? { nom: a.titulaire, adresse: e.adresse, siret: e.siret, infos: infosMarche(a, e.creee), departement: a.departement } : null;
      }),
    );
    for (const x of lot) if (x && trouves.length < PAR_JOUR) trouves.push(x);
  }
  return trouves;
}

async function prospecter(secret: string) {
  const debut = Date.now();
  const sb = clientMoteur();
  const { data: comptes, error } = await sb.rpc("agent_comptes_marches", { p_secret: secret });
  if (error) throw new Error(error.message);
  if (!comptes?.length) return { comptes: 0 };
  const depuis = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
  const attributions = lireAttributions(await json(urlAttributions(depuis, 100)));
  const trouves = await trouver(attributions, debut);
  const bilan: Record<string, number> = {};
  for (const { user_id } of comptes as { user_id: string }[]) {
    const { data, error: e } = await sb.rpc("agent_ajouter_prospects_marches", { p_secret: secret, p_user: user_id, p_liste: trouves });
    if (e) console.warn("marches", user_id, e.message);
    bilan[user_id] = Number(data ?? 0);
  }
  return { attributions: attributions.length, trouves: trouves.length, ajoutes: bilan };
}

export const Route = createFileRoute("/api/agent/marches")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-agent-secret") ?? "";
        const attendu = process.env.AGENT_TICK_SECRET ?? "";
        if (!attendu || secret !== attendu) return new Response("Non autorisé", { status: 401 });
        try {
          return Response.json({ ok: true, ...(await prospecter(secret)) });
        } catch (e) {
          console.error("marches", e);
          return Response.json({ ok: false, erreur: e instanceof Error ? e.message : "erreur" }, { status: 500 });
        }
      },
    },
  },
});
