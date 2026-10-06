import { createFileRoute } from "@tanstack/react-router";
import { envoyerEmailsCibles, traiterEmails } from "@/lib/email.server";

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
          // Envoi ciblé (ex. architectes choisis) : { user_id, ids: [...] }.
          const corps = (await request.json().catch(() => null)) as {
            user_id?: string;
            ids?: string[];
          } | null;
          if (corps?.user_id && Array.isArray(corps.ids) && corps.ids.length)
            return Response.json({
              ok: true,
              ...(await envoyerEmailsCibles(
                secret,
                corps.user_id,
                corps.ids.slice(0, 50),
                Date.now() + 270_000,
              )),
            });
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
