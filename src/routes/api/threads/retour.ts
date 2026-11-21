import { createFileRoute } from "@tanstack/react-router";
import { cleThreads, compteDepuisCodeThreads, threadsConfigure } from "@/lib/threads.server";
import { lireEtat } from "@/lib/meta.server";
import { URL_SITE } from "@/lib/preparation.server";
import { clientMoteur } from "@/lib/supabase-serveur";

// Retour de la page d'autorisation Threads (compte Threads en direct).
function versComptes(params: Record<string, string>) {
  return Response.redirect(`${URL_SITE}/comptes?${new URLSearchParams(params)}`, 302);
}

export const Route = createFileRoute("/api/threads/retour")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const q = new URL(request.url).searchParams;
        const echec = (erreur: string, message?: string) =>
          versComptes({ error: erreur, platform: "threads", ...(message ? { error_message: message } : {}) });

        if (!threadsConfigure()) return echec("config", "Connexion Threads non configurée (THREADS_APP_ID / THREADS_APP_SECRET).");
        if (q.get("error")) return echec("oauth_denied", q.get("error_description") ?? undefined);
        const userId = lireEtat(q.get("state") ?? "", cleThreads().secret);
        const code = q.get("code");
        if (!userId || !code) return echec("etat", "Lien de connexion expiré. Cliquez à nouveau sur « Connecter ».");

        try {
          const c = await compteDepuisCodeThreads(code.replace(/#_$/, ""));
          const { error } = await clientMoteur().rpc("compte_direct_enregistrer", {
            p_secret: process.env.AGENT_TICK_SECRET ?? "",
            p_user: userId,
            p_fournisseur: "threads",
            p_plateforme: "threads",
            p_externe: c.externe,
            p_nom: c.nom,
            p_jeton: c.jeton,
          });
          if (error) throw new Error(error.message);
          return versComptes({ connected: "threads" });
        } catch (e) {
          console.error("threads retour", e);
          return echec("threads", e instanceof Error ? e.message : "Erreur Threads");
        }
      },
    },
  },
});
