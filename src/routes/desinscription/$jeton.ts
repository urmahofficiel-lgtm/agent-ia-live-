import { createFileRoute } from "@tanstack/react-router";
import { clientMoteur } from "@/lib/supabase-serveur";

// Désinscription des e-mails de prospection, sans compte. GET : page de
// confirmation (les antivirus qui ouvrent les liens ne désinscrivent
// personne) ; POST : désinscription (bouton, ou « 1 clic » des messageries,
// RFC 8058).
const page = (titre: string, contenu: string) =>
  new Response(
    `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${titre}</title></head>
<body style="margin:0;font-family:Arial,Helvetica,sans-serif;background:#f4f4f5;color:#111">
<main style="max-width:480px;margin:48px auto;padding:24px;background:#fff;border-radius:12px">
<h1 style="font-size:20px;margin:0 0 12px">${titre}</h1>${contenu}</main></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );

const jetonValide = (j: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(j);
const invalide = () =>
  page("Lien invalide", "<p>Ce lien de désinscription n'est pas valide.</p>");

export const Route = createFileRoute("/desinscription/$jeton")({
  server: {
    handlers: {
      GET: ({ params }) => {
        if (!jetonValide(params.jeton)) return invalide();
        return page(
          "Ne plus recevoir nos messages",
          `<p style="line-height:1.5">Confirmez pour ne plus jamais recevoir de message de prospection de notre part.</p>
<form method="post"><button type="submit" style="margin-top:12px;padding:12px 18px;border:0;border-radius:8px;background:#111;color:#fff;font-size:15px;cursor:pointer">Me désinscrire</button></form>`,
        );
      },
      POST: async ({ params }) => {
        if (!jetonValide(params.jeton)) return invalide();
        const { data, error } = await clientMoteur().rpc(
          "desinscrire_prospect",
          { p_jeton: params.jeton },
        );
        if (error)
          return page(
            "Erreur",
            "<p>La désinscription n'a pas pu être enregistrée. Répondez simplement « STOP » à notre e-mail.</p>",
          );
        const marque =
          typeof data === "string" ? data.replace(/[<>&"]/g, "") : null;
        return page(
          "C'est fait",
          `<p style="line-height:1.5">${marque ? `Vous ne recevrez plus de message de prospection de ${marque}.` : "Vous ne recevrez plus de message de notre part."}</p>`,
        );
      },
    },
  },
});
