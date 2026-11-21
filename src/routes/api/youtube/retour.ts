import { createFileRoute } from "@tanstack/react-router";
import { cleYoutube, compteDepuisCodeYoutube, youtubeConfigure } from "@/lib/youtube.server";
import { lireEtat } from "@/lib/meta.server";
import { URL_SITE } from "@/lib/preparation.server";
import { clientMoteur } from "@/lib/supabase-serveur";

// Retour de la page d'autorisation Google (chaîne YouTube en direct).
function versComptes(params: Record<string, string>) {
  return Response.redirect(`${URL_SITE}/comptes?${new URLSearchParams(params)}`, 302);
}

export const Route = createFileRoute("/api/youtube/retour")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const q = new URL(request.url).searchParams;
        const echec = (erreur: string, message?: string) =>
          versComptes({ error: erreur, platform: "youtube", ...(message ? { error_message: message } : {}) });

        if (!youtubeConfigure()) return echec("config", "Connexion YouTube non configurée (YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET).");
        if (q.get("error")) return echec("oauth_denied", q.get("error_description") ?? undefined);
        const userId = lireEtat(q.get("state") ?? "", cleYoutube().secret);
        const code = q.get("code");
        if (!userId || !code) return echec("etat", "Lien de connexion expiré. Cliquez à nouveau sur « Connecter ».");

        try {
          const c = await compteDepuisCodeYoutube(code);
          const { error } = await clientMoteur().rpc("compte_direct_enregistrer", {
            p_secret: process.env.AGENT_TICK_SECRET ?? "",
            p_user: userId,
            p_fournisseur: "youtube",
            p_plateforme: "youtube",
            p_externe: c.externe,
            p_nom: c.nom,
            p_jeton: c.jeton,
          });
          if (error) throw new Error(error.message);
          return versComptes({ connected: "youtube" });
        } catch (e) {
          console.error("youtube retour", e);
          return echec("youtube", e instanceof Error ? e.message : "Erreur YouTube");
        }
      },
    },
  },
});
