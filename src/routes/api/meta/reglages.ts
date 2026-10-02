import { createFileRoute } from "@tanstack/react-router";
import { URL_SITE } from "@/lib/preparation.server";

// Réglages de l'application Meta (réservé au moteur, secret requis) : lit les
// domaines déclarés et, avec ?reparer=1, ajoute le domaine du site s'il
// manque (sans lui, Facebook refuse la connexion : « Le domaine de cette URL
// n'est pas inscrit »). Jeton d'application = APP_ID|APP_SECRET.
const GRAPH = "https://graph.facebook.com/v23.0";

export const Route = createFileRoute("/api/meta/reglages")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const attendu = process.env.AGENT_TICK_SECRET ?? "";
        if (!attendu || request.headers.get("x-agent-secret") !== attendu)
          return new Response("Non autorisé", { status: 401 });
        const appId = process.env.META_APP_ID;
        const secret = process.env.META_APP_SECRET;
        if (!appId || !secret)
          return Response.json({
            ok: false,
            erreur: "META_APP_ID / META_APP_SECRET absents",
          });
        const jeton = `${appId}|${secret}`;
        const lire = async () => {
          const r = await fetch(
            `${GRAPH}/${appId}?${new URLSearchParams({ fields: "name,app_domains,website_url", access_token: jeton })}`,
          );
          return (await r.json()) as {
            app_domains?: string[];
            website_url?: string;
            name?: string;
            error?: { message?: string };
          };
        };
        const avant = await lire();
        const domaine = new URL(URL_SITE).hostname;
        let reparation: unknown = null;
        if (
          new URL(request.url).searchParams.get("reparer") === "1" &&
          !avant.error
        ) {
          const domaines = [
            ...new Set([...(avant.app_domains ?? []), domaine]),
          ];
          const r = await fetch(`${GRAPH}/${appId}`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              app_domains: JSON.stringify(domaines),
              access_token: jeton,
            }),
          });
          reparation = await r.json().catch(() => ({ statut: r.status }));
        }
        const apres = reparation ? await lire() : null;
        return Response.json({
          ok: true,
          domaine_attendu: domaine,
          avant,
          reparation,
          apres,
        });
      },
    },
  },
});
