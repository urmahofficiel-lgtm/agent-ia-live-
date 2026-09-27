import { createFileRoute } from "@tanstack/react-router";
import { cleInstagram, compteDepuisCodeInstagram, instagramConfigure } from "@/lib/instagram.server";
import { lireEtat } from "@/lib/meta.server";
import { URL_SITE } from "@/lib/preparation.server";
import { clientMoteur } from "@/lib/supabase-serveur";

// Retour de la page d'autorisation Instagram (connexion directe, sans page
// Facebook). Même format d'erreur que Zernio et Meta pour la page Comptes.
function versComptes(params: Record<string, string>) {
  return Response.redirect(`${URL_SITE}/comptes?${new URLSearchParams(params)}`, 302);
}

export const Route = createFileRoute("/api/instagram/retour")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const q = new URL(request.url).searchParams;
        const echec = (erreur: string, message?: string) =>
          versComptes({ error: erreur, platform: "instagram", ...(message ? { error_message: message } : {}) });

        if (!instagramConfigure()) return echec("config", "Connexion Instagram non configurée (INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET).");
        if (q.get("error")) return echec("oauth_denied");
        const userId = lireEtat(q.get("state") ?? "", cleInstagram().secret);
        const code = q.get("code");
        if (!userId || !code) return echec("etat", "Lien de connexion expiré. Cliquez à nouveau sur « Connecter ».");

        try {
          const c = await compteDepuisCodeInstagram(code.replace(/#_$/, ""));
          const { error } = await clientMoteur().rpc("instagram_enregistrer_compte", {
            p_secret: process.env.AGENT_TICK_SECRET ?? "",
            p_user: userId,
            p_externe: c.externe_id,
            p_nom: c.nom,
            p_jeton: c.jeton,
          });
          if (error) throw new Error(error.message);
          return versComptes({ connected: "instagram" });
        } catch (e) {
          console.error("instagram retour", e);
          return echec("instagram", e instanceof Error ? e.message : "Erreur Instagram");
        }
      },
    },
  },
});
