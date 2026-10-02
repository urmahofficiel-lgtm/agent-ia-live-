import { createFileRoute } from "@tanstack/react-router";
import { compteHF, imageVersVideoHF } from "@/lib/hf.server";

// Diagnostic du Studio vidéo (moteur, secret requis) : génère un morceau de
// 2 s à partir de l'image donnée (?image=URL) avec la clé HF_TOKEN.
export const Route = createFileRoute("/api/studio/test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const attendu = process.env.AGENT_TICK_SECRET ?? "";
        if (!attendu || request.headers.get("x-agent-secret") !== attendu)
          return new Response("Non autorisé", { status: 401 });
        const url = new URL(request.url).searchParams.get("image") ?? "";
        const debut = Date.now();
        try {
          const img = await fetch(url, { signal: AbortSignal.timeout(20_000) });
          if (!img.ok) throw new Error(`image ${img.status}`);
          const { donnees } = await imageVersVideoHF(
            { donnees: await img.blob(), nom: "test.jpg" },
            "smooth cinematic camera push-in, gentle motion",
            2,
            async () => undefined,
            250_000,
          );
          return Response.json({
            ok: true,
            octets: donnees.length,
            secondes: Math.round((Date.now() - debut) / 1000),
          });
        } catch (e) {
          return Response.json({
            ok: false,
            erreur: e instanceof Error ? e.message : String(e),
            compte: await compteHF(),
            secondes: Math.round((Date.now() - debut) / 1000),
          });
        }
      },
    },
  },
});
