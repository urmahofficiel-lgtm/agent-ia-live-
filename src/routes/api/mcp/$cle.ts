import { createFileRoute } from "@tanstack/react-router";
import { CleInvalide, creerAppel, empreinteCle, traiterMessage } from "@/lib/mcp.server";

// Adresse du connecteur à coller dans Claude (Paramètres → Connecteurs) ou
// ChatGPT : https://agent-ia-live.vercel.app/api/mcp/<clé personnelle>
const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { "Content-Type": "application/json" } });

export const Route = createFileRoute("/api/mcp/$cle")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!/^ail_[A-Za-z0-9_-]{30,}$/.test(params.cle)) return json({ error: "Clé du connecteur invalide." }, 401);
        let corps: unknown;
        try {
          corps = await request.json();
        } catch {
          return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON invalide" } }, 400);
        }
        const appel = creerAppel(empreinteCle(params.cle));
        const messages = (Array.isArray(corps) ? corps : [corps]) as Parameters<typeof traiterMessage>[0][];
        try {
          const reponses = (await Promise.all(messages.map((m) => traiterMessage(m, appel)))).filter((r) => r !== null);
          if (reponses.length === 0) return new Response(null, { status: 202 });
          return json(Array.isArray(corps) ? reponses : reponses[0]);
        } catch (e) {
          if (e instanceof CleInvalide) return json({ error: e.message }, 401);
          console.error("mcp", e);
          return json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Erreur interne" } }, 500);
        }
      },
      // Pas de flux serveur → client ni de session : seul POST est utilisé.
      GET: () => new Response("Méthode non autorisée", { status: 405, headers: { Allow: "POST" } }),
      DELETE: () => new Response("Méthode non autorisée", { status: 405, headers: { Allow: "POST" } }),
    },
  },
});
