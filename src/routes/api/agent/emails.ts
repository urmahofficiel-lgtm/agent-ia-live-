import { createFileRoute } from "@tanstack/react-router";
import { traiterEmails } from "@/lib/email.server";

// Agent e-mail : appelé toutes les 15 minutes, du lundi au vendredi en
// journée, par pg_cron. Rédige les e-mails de prospection du moment et les
// envoie (sauf si l'utilisateur valide chaque e-mail).
export const Route = createFileRoute("/api/agent/emails")({
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
            ...(await traiterEmails(secret, Date.now() + 200_000)),
          });
        } catch (e) {
          console.error("emails", e);
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
