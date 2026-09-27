import { createFileRoute } from "@tanstack/react-router";
import { VERSION_GRAPH } from "@/lib/meta";
import { RETOUR_META } from "@/lib/meta.server";

// Vérifie la configuration Meta sans rien révéler de secret : l'identifiant et
// la clé secrète vont-ils ensemble, l'ID de configuration a-t-il la bonne forme.
export const Route = createFileRoute("/api/meta/diagnostic")({
  server: {
    handlers: {
      GET: async () => {
        const appId = (process.env.META_APP_ID ?? "").trim();
        const secret = (process.env.META_APP_SECRET ?? "").trim();
        const configId = (process.env.META_CONFIG_ID ?? "").trim();
        const r: Record<string, unknown> = {
          app_id: appId || null,
          app_id_brut_different: appId !== (process.env.META_APP_ID ?? ""),
          secret_present: Boolean(secret),
          secret_longueur: secret.length,
          config_id: configId || null,
          config_id_chiffres: /^\d+$/.test(configId),
          config_id_egal_app_id: configId !== "" && configId === appId,
          retour: RETOUR_META,
        };
        if (appId && secret) {
          const rep = await fetch(
            `https://graph.facebook.com/${VERSION_GRAPH}/${appId}?fields=id,name&access_token=${encodeURIComponent(`${appId}|${secret}`)}`,
          );
          const json = (await rep.json().catch(() => ({}))) as { name?: string; error?: { message?: string } };
          r.cles_valides = rep.ok;
          r.nom_app = json.name ?? null;
          r.erreur_meta = json.error?.message ?? null;
        }
        return Response.json(r);
      },
    },
  },
});
