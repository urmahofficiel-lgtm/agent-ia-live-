import { createFileRoute } from "@tanstack/react-router";
import { cleLinkedin, compteDepuisCodeLinkedin, linkedinConfigure } from "@/lib/linkedin.server";
import { lireEtat } from "@/lib/meta.server";
import { URL_SITE } from "@/lib/preparation.server";
import { clientMoteur } from "@/lib/supabase-serveur";

// Retour de la page d'autorisation LinkedIn (profil personnel en direct).
function versComptes(params: Record<string, string>) {
  return Response.redirect(`${URL_SITE}/comptes?${new URLSearchParams(params)}`, 302);
}

export const Route = createFileRoute("/api/linkedin/retour")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const q = new URL(request.url).searchParams;
        const echec = (erreur: string, message?: string) =>
          versComptes({ error: erreur, platform: "linkedin", ...(message ? { error_message: message } : {}) });

        if (!linkedinConfigure()) return echec("config", "Connexion LinkedIn non configurée (LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET).");
        if (q.get("error")) return echec("oauth_denied", q.get("error_description") ?? undefined);
        const userId = lireEtat(q.get("state") ?? "", cleLinkedin().secret);
        const code = q.get("code");
        if (!userId || !code) return echec("etat", "Lien de connexion expiré. Cliquez à nouveau sur « Connecter ».");

        try {
          const c = await compteDepuisCodeLinkedin(code);
          const { error } = await clientMoteur().rpc("compte_direct_enregistrer", {
            p_secret: process.env.AGENT_TICK_SECRET ?? "",
            p_user: userId,
            p_fournisseur: "linkedin",
            p_plateforme: "linkedin",
            p_externe: c.externe,
            p_nom: c.nom,
            p_jeton: c.jeton,
          });
          if (error) throw new Error(error.message);
          return versComptes({ connected: "linkedin" });
        } catch (e) {
          console.error("linkedin retour", e);
          return echec("linkedin", e instanceof Error ? e.message : "Erreur LinkedIn");
        }
      },
    },
  },
});
