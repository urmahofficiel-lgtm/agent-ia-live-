import { createFileRoute } from "@tanstack/react-router";
import {
  compteHF,
  imageVersVideoHF,
  synchroniserLevresHF,
} from "@/lib/hf.server";
import { analyserScene } from "@/lib/personnage.server";
import { choisirVoix, tonVoix } from "@/lib/personnage";
import { enWav, voixOff } from "@/lib/voix.server";
import { ajouterVoix } from "@/lib/video.server";

// Diagnostic du Studio vidéo (moteur, secret requis), étape par étape :
// ?etape=animation&image=URL · ?etape=analyse&image=URL&prompt=… ·
// ?etape=voix&video=URL&image=URL&prompt=… · ?etape=levres&video=URL&image=URL&prompt=…
export const Route = createFileRoute("/api/studio/test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const attendu = process.env.AGENT_TICK_SECRET ?? "";
        if (!attendu || request.headers.get("x-agent-secret") !== attendu)
          return new Response("Non autorisé", { status: 401 });
        const q = new URL(request.url).searchParams;
        const etape = q.get("etape") ?? "animation";
        const debut = Date.now();
        const temps = () => Math.round((Date.now() - debut) / 1000);
        const charger = async (url: string) => {
          const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
          if (!r.ok) throw new Error(`téléchargement ${r.status}`);
          return new Uint8Array(await r.arrayBuffer());
        };
        try {
          const image = await charger(q.get("image") ?? "");
          if (etape === "animation") {
            const { donnees } = await imageVersVideoHF(
              { donnees: new Blob([image]), nom: "test.jpg" },
              "smooth cinematic camera push-in",
              2,
              async () => undefined,
              250_000,
            );
            return Response.json({
              ok: true,
              etape,
              octets: donnees.length,
              secondes: temps(),
            });
          }
          const analyse = await analyserScene(
            image,
            "image/jpeg",
            q.get("prompt") ?? "",
            10,
          );
          if (etape === "analyse")
            return Response.json({
              ok: Boolean(analyse),
              etape,
              analyse,
              voix: analyse && choisirVoix(analyse),
              secondes: temps(),
            });
          if (!analyse?.parole)
            return Response.json({
              ok: false,
              etape,
              erreur: "pas de phrase détectée",
              analyse,
            });
          const audio = await voixOff(
            analyse.parole,
            tonVoix(analyse),
            choisirVoix(analyse),
          );
          if (!audio)
            return Response.json({
              ok: false,
              etape,
              erreur: "voix Gemini indisponible",
              secondes: temps(),
            });
          const wav = enWav(audio);
          const video = await charger(q.get("video") ?? "");
          if (etape === "voix") {
            const finale = await ajouterVoix(video, wav);
            return Response.json({
              ok: true,
              etape,
              voix: choisirVoix(analyse),
              duree_voix: audio.duree,
              octets: finale.length,
              secondes: temps(),
            });
          }
          const { donnees } = await synchroniserLevresHF(video, wav, 250_000);
          return Response.json({
            ok: true,
            etape,
            octets: donnees.length,
            secondes: temps(),
          });
        } catch (e) {
          return Response.json({
            ok: false,
            etape,
            erreur: e instanceof Error ? e.message : String(e),
            compte: await compteHF(),
            secondes: temps(),
          });
        }
      },
    },
  },
});
