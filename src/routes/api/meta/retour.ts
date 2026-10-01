import { createFileRoute } from "@tanstack/react-router";
import { comptesDepuisCode, lireEtat, metaConfigure } from "@/lib/meta.server";
import { URL_SITE } from "@/lib/preparation.server";
import { clientMoteur } from "@/lib/supabase-serveur";

// Retour de la page d'autorisation Facebook : on récupère les pages (et leurs
// comptes Instagram), on range les jetons côté serveur, puis on renvoie
// l'utilisateur sur la page Comptes, avec le même format d'erreur que Zernio.
function versComptes(params: Record<string, string>) {
  return Response.redirect(
    `${URL_SITE}/comptes?${new URLSearchParams(params)}`,
    302,
  );
}

export const Route = createFileRoute("/api/meta/retour")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const q = new URL(request.url).searchParams;
        const echec = (erreur: string, message?: string) =>
          versComptes({
            error: erreur,
            platform: "facebook",
            ...(message ? { error_message: message } : {}),
          });

        if (!metaConfigure())
          return echec(
            "config",
            "Connexion Meta non configurée (META_APP_ID / META_APP_SECRET).",
          );
        if (q.get("error")) {
          console.warn(
            "meta retour : refus",
            q.get("error_reason"),
            q.get("error_description"),
          );
          return echec("oauth_denied");
        }
        const userId = lireEtat(q.get("state") ?? "");
        const code = q.get("code");
        if (!userId || !code)
          return echec(
            "etat",
            "Lien de connexion expiré. Cliquez à nouveau sur « Connecter ».",
          );

        try {
          const comptes = await comptesDepuisCode(code);
          if (comptes.length === 0) {
            console.warn("meta retour : aucune page partagée");
            return echec("no_facebook_pages");
          }
          const { error } = await clientMoteur().rpc(
            "meta_enregistrer_comptes",
            {
              p_secret: process.env.AGENT_TICK_SECRET ?? "",
              p_user: userId,
              p_comptes: comptes,
            },
          );
          if (error) throw new Error(error.message);
          console.info("meta retour : connecté", comptes.length, "compte(s)");
          return versComptes({ connected: "meta" });
        } catch (e) {
          console.error("meta retour", e);
          return echec("meta", e instanceof Error ? e.message : "Erreur Meta");
        }
      },
    },
  },
});
