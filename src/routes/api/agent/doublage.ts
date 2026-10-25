import { createFileRoute } from "@tanstack/react-router";
import { clientMoteur } from "@/lib/supabase-serveur";
import { analyserVideo, mixerDoublage, voixReplique, type Analyse } from "@/lib/doublage.server";

// Moteur de doublage (Voix réalistes) : appelé chaque minute par pg_cron.
// Avance le doublage en attente le plus ancien, étape par étape, dans la
// limite du temps d'un passage ; le passage suivant reprend où il s'est arrêté.
const BUDGET = 230_000;
const MAX_ECHECS = 3;

type Doublage = {
  id: string;
  user_id: string;
  source_url: string;
  etape: "ecoute" | "voix" | "mixage";
  etude: Analyse | null;
  segments: Record<string, { url: string; duree: number }>;
  echecs: number;
  contexte: string | null;
};

async function telecharger(url: string) {
  const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`Fichier illisible (${r.status}).`);
  return Buffer.from(await r.arrayBuffer());
}

async function avancer(secret: string) {
  const debut = Date.now();
  const reste = () => BUDGET - (Date.now() - debut);
  const sb = clientMoteur();
  const { data, error } = await sb.rpc("agent_doublage_a_faire", { p_secret: secret });
  if (error) throw new Error(error.message);
  const d = ((data ?? []) as Doublage[])[0];
  if (!d) return { rien: true };
  const maj = (champs: Record<string, unknown>) => sb.rpc("agent_doublage_maj", { p_secret: secret, p_id: d.id, p_champs: champs });

  // Dépôt d'un fichier du moteur dans le dossier de l'utilisateur (ticket).
  const deposer = async (bucket: "studio" | "videos", nom: string, fichier: Buffer, type: string) => {
    const { data: jeton, error: e } = await sb.rpc("agent_depot_video", { p_secret: secret, p_user: d.user_id });
    if (e || typeof jeton !== "string") throw new Error("Dépôt impossible.");
    const chemin = `${d.user_id}/auto-${jeton}/${nom}`;
    const { error: e2 } = await sb.storage.from(bucket).upload(chemin, fichier, { contentType: type });
    if (e2) throw new Error(`Dépôt impossible : ${e2.message}`);
    return sb.storage.from(bucket).getPublicUrl(chemin).data.publicUrl;
  };

  try {
    const video = await telecharger(d.source_url);
    let analyse = d.etude;
    let etape = d.etape;
    const segments = { ...d.segments };

    // 1. Écouter et regarder.
    if (etape === "ecoute" || !analyse) {
      analyse = await analyserVideo(video, d.contexte);
      etape = "voix";
      await maj({ etape, etude: analyse, erreur: null, progres: true });
    }

    // 2. La voix de chaque réplique (2 à la fois), tant qu'il reste du temps.
    if (etape === "voix") {
      const a = analyse;
      const restantes = a.repliques.map((_, i) => i).filter((i) => !segments[i]);
      for (let k = 0; k < restantes.length && reste() > 40_000; k += 2) {
        const lot = restantes.slice(k, k + 2);
        const faits = await Promise.all(
          lot.map(async (i) => {
            const v = await voixReplique(a, i);
            const url = await deposer("studio", `doublage-${d.id}-r${i}.mp3`, v.mp3, "audio/mpeg");
            return [String(i), { url, duree: v.duree }] as const;
          }),
        );
        Object.assign(segments, Object.fromEntries(faits));
        await maj({ segments: Object.fromEntries(faits), erreur: null, progres: true });
      }
      if (a.repliques.every((_, i) => segments[i])) {
        etape = "mixage";
        await maj({ etape });
      }
    }

    // 3. Mixage (s'il reste assez de temps, sinon au passage suivant).
    if (etape === "mixage" && reste() > 45_000) {
      const a = analyse;
      const voix = await Promise.all(
        a.repliques.map(async (_, i) => ({ mp3: await telecharger(segments[i].url), duree: segments[i].duree })),
      );
      const mp4 = await mixerDoublage(video, a, voix);
      const video_url = await deposer("videos", `doublage-${d.id}.mp4`, mp4, "video/mp4");
      await maj({ statut: "pret", video_url, erreur: null, libre: true });
      return { id: d.id, pret: true };
    }
    await maj({ libre: true });
    return { id: d.id, etape, voix: Object.keys(segments).length, repliques: analyse.repliques.length };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inattendue.";
    console.warn("doublage", d.id, message);
    // Erreur passagère (IA saturée) : on réessaie au passage suivant ; 3 échecs
    // de suite, sans aucun progrès entre eux : abandon.
    await maj(d.echecs + 1 >= MAX_ECHECS ? { statut: "echec", erreur: message, libre: true } : { erreur: message, echec: true, libre: true });
    return { id: d.id, erreur: message };
  }
}

export const Route = createFileRoute("/api/agent/doublage")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-agent-secret") ?? "";
        const attendu = process.env.AGENT_TICK_SECRET ?? "";
        if (!attendu || secret !== attendu) return new Response("Non autorisé", { status: 401 });
        try {
          return Response.json({ ok: true, ...(await avancer(secret)) });
        } catch (e) {
          console.error("doublage", e);
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
