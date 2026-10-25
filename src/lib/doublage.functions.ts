import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { SUPABASE_URL, utilisateurDepuisJeton } from "./supabase-serveur";
import { doublerVideo, voixRealistesDisponibles } from "./doublage.server";
import type { Personnage, Replique } from "./doublage";

type Resultat<T = object> = ({ ok: true } & T) | { ok: false; erreur: string };
const jeton = z.string().min(10);
const message = (e: unknown) => (e instanceof Error ? e.message : "Erreur inattendue.");

// Voix réalistes branchées (clé ElevenLabs dans Vercel) ?
export const etatDoublage = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ jeton }).parse(input))
  .handler(async ({ data }): Promise<Resultat<{ elevenlabs: boolean }>> => {
    try {
      await utilisateurDepuisJeton(data.jeton);
      return { ok: true, elevenlabs: voixRealistesDisponibles() };
    } catch (e) {
      return { ok: false, erreur: message(e) };
    }
  });

// Refait les voix d'une vidéo déposée dans le Studio (dossier de
// l'utilisateur) : mêmes images, mêmes répliques, voix réalistes.
export const doublerMaVideo = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ jeton, url: z.string().url().max(2000) }).parse(input))
  .handler(
    async ({
      data,
    }): Promise<Resultat<{ video_url: string; repliques: Replique[]; personnages: (Personnage & { voix: string })[]; moteur: string }>> => {
      try {
        const { sb, user } = await utilisateurDepuisJeton(data.jeton);
        // Seulement une vidéo de son propre dossier du Studio.
        const prefixe = `${SUPABASE_URL}/storage/v1/object/public/studio/${user.id}/`;
        if (!data.url.startsWith(prefixe)) return { ok: false, erreur: "Vidéo introuvable : déposez-la d'abord ici." };
        const r = await fetch(data.url, { signal: AbortSignal.timeout(60_000) });
        if (!r.ok) return { ok: false, erreur: "Vidéo illisible : déposez-la à nouveau." };
        const { data: contexte } = await sb.rpc("mon_contexte_marque");
        const d = await doublerVideo(Buffer.from(await r.arrayBuffer()), (contexte as string | null) ?? null);
        const chemin = `${user.id}/doublage-${Date.now()}.mp4`;
        const { error } = await sb.storage.from("videos").upload(chemin, d.video, { contentType: "video/mp4" });
        if (error) throw new Error(`Enregistrement de la vidéo impossible : ${error.message}`);
        return {
          ok: true,
          video_url: sb.storage.from("videos").getPublicUrl(chemin).data.publicUrl,
          repliques: d.repliques,
          personnages: d.personnages,
          moteur: d.moteur,
        };
      } catch (e) {
        return { ok: false, erreur: message(e) };
      }
    },
  );
