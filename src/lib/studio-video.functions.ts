import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  DUREES,
  QUALITES,
  consigneSuite,
  coutEstime,
  decouper,
  lireStatutXai,
  progressionGlobale,
  videoComplete,
  type Qualite,
  type Segment,
} from "./studio-video";
import {
  genererVideo,
  prolongerVideo,
  statutVideo,
  xaiConfigure,
} from "./xai.server";
import { recollerVideos } from "./video.server";
import { utilisateurDepuisJeton } from "./supabase-serveur";

// Studio vidéo IA : la page lance la génération puis appelle « suivre »
// toutes les quelques secondes ; chaque appel fait avancer d'une étape
// (morceau suivant, prolongation, recollage, enregistrement).

type Resultat<T = object> = ({ ok: true } & T) | { ok: false; erreur: string };
type Sb = Awaited<ReturnType<typeof utilisateurDepuisJeton>>["sb"];

const texte = (e: unknown) =>
  e instanceof Error ? e.message : "Erreur inattendue.";
const PAR_JOUR = 10; // garde-fou de coût
const PERDUE_MS = 40 * 60_000;

type VideoIA = {
  id: string;
  user_id: string;
  statut: string;
  image_chemin: string;
  prompt: string;
  duree: number;
  format: string;
  qualite: Qualite;
  segments: Segment[];
  created_at: string;
};

export const lancerVideoIA = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        image: z.string().min(3).max(300),
        prompt: z.string().trim().min(3).max(4000),
        duree: z.union(
          DUREES.map((d) => z.literal(d)) as [
            z.ZodLiteral<10>,
            z.ZodLiteral<15>,
            z.ZodLiteral<20>,
            z.ZodLiteral<30>,
          ],
        ),
        format: z.enum(["9:16", "16:9", "1:1"]),
        qualite: z.enum(["standard", "premium"]),
        jeton: z.string().min(10),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<Resultat<{ id: string }>> => {
    if (!xaiConfigure())
      return {
        ok: false,
        erreur:
          "Studio vidéo pas encore activé : ajoutez la clé XAI_API_KEY dans Vercel.",
      };
    try {
      const { sb, user } = await utilisateurDepuisJeton(data.jeton);
      if (!data.image.startsWith(`${user.id}/`) || data.image.includes(".."))
        return { ok: false, erreur: "Image non autorisée." };
      const depuis = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { count } = await sb
        .from("videos_ia")
        .select("id", { count: "exact", head: true })
        .gte("created_at", depuis);
      if ((count ?? 0) >= PAR_JOUR)
        return {
          ok: false,
          erreur: `Limite de ${PAR_JOUR} vidéos par 24 h atteinte.`,
        };

      const lien = await sb.storage
        .from("animations")
        .createSignedUrl(data.image, 7200);
      if (!lien.data)
        return {
          ok: false,
          erreur: "Image introuvable : importez-la à nouveau.",
        };
      const { data: ligne, error } = await sb
        .from("videos_ia")
        .insert({
          user_id: user.id,
          image_chemin: data.image,
          prompt: data.prompt,
          duree: data.duree,
          format: data.format,
          qualite: data.qualite,
          cout_estime: coutEstime(data.duree, data.qualite),
          statut: "en_cours",
        })
        .select("id")
        .single();
      if (error || !ligne)
        return {
          ok: false,
          erreur: error?.message ?? "Enregistrement impossible.",
        };
      try {
        const premier = decouper(data.duree)[0];
        const request_id = await genererVideo({
          modele: QUALITES[data.qualite].modele,
          prompt: data.prompt,
          imageUrl: lien.data.signedUrl,
          duree: premier,
          format: data.format,
        });
        const segments: Segment[] = [
          {
            request_id,
            duree: premier,
            genre: "generation",
            statut: "en_cours",
          },
        ];
        await sb.from("videos_ia").update({ segments }).eq("id", ligne.id);
      } catch (e) {
        await sb
          .from("videos_ia")
          .update({ statut: "echouee", erreur: texte(e) })
          .eq("id", ligne.id);
        return { ok: false, erreur: texte(e) };
      }
      return { ok: true, id: ligne.id };
    } catch (e) {
      return { ok: false, erreur: texte(e) };
    }
  });

async function telecharger(url: string) {
  const r = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  if (!r.ok) throw new Error("Téléchargement de la vidéo générée impossible.");
  return new Uint8Array(await r.arrayBuffer());
}

// Toutes les parties prêtes : vidéo finale dans notre stockage (les liens xAI
// sont temporaires).
async function finaliser(sb: Sb, v: VideoIA, segments: Segment[]) {
  const urls = segments
    .map((s) => s.url)
    .filter((u): u is string => Boolean(u));
  const donnees = videoComplete(segments, v.duree)
    ? await telecharger(urls[urls.length - 1])
    : await recollerVideos(await Promise.all(urls.map(telecharger)));
  const chemin = `${v.user_id}/studio-${v.id}.mp4`;
  const { error } = await sb.storage
    .from("videos")
    .upload(chemin, donnees, { contentType: "video/mp4", upsert: true });
  if (error)
    throw new Error(`Enregistrement de la vidéo impossible : ${error.message}`);
  const resultat_url = sb.storage.from("videos").getPublicUrl(chemin)
    .data.publicUrl;
  await sb
    .from("videos_ia")
    .update({
      statut: "terminee",
      segments,
      progression: 100,
      resultat_url,
      erreur: null,
    })
    .eq("id", v.id);
}

export const suivreVideoIA = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), jeton: z.string().min(10) }).parse(input),
  )
  .handler(async ({ data }): Promise<Resultat> => {
    try {
      const { sb } = await utilisateurDepuisJeton(data.jeton);
      const { data: v } = await sb
        .from("videos_ia")
        .select("*")
        .eq("id", data.id)
        .single<VideoIA>();
      if (!v) return { ok: false, erreur: "Vidéo introuvable." };
      if (v.statut !== "en_cours") return { ok: true };
      try {
        if (Date.now() - new Date(v.created_at).getTime() > PERDUE_MS)
          throw new Error("La génération a pris trop de temps. Réessayez.");
        const plan = decouper(v.duree);
        const segments = [...(v.segments ?? [])];
        const courant = segments.find((s) => s.statut === "en_cours");
        if (!courant) return { ok: true };
        const etat = lireStatutXai(await statutVideo(courant.request_id));
        if (etat.statut === "echoue")
          throw new Error(etat.erreur ?? "La génération a échoué.");
        if (etat.statut === "en_cours") {
          await sb
            .from("videos_ia")
            .update({
              progression: progressionGlobale(plan, segments, etat.progression),
            })
            .eq("id", v.id);
          return { ok: true };
        }
        Object.assign(courant, {
          statut: "termine",
          url: etat.url,
          duree_obtenue: etat.duree,
        });
        if (segments.length < plan.length) {
          // Morceau suivant : prolongation de la dernière vidéo obtenue.
          const duree = plan[segments.length];
          const request_id = await prolongerVideo({
            modele: QUALITES[v.qualite].modele,
            prompt: consigneSuite(v.prompt),
            videoUrl: etat.url!,
            duree,
          });
          segments.push({
            request_id,
            duree,
            genre: "prolongation",
            statut: "en_cours",
          });
          await sb
            .from("videos_ia")
            .update({
              segments,
              progression: progressionGlobale(plan, segments, 0),
            })
            .eq("id", v.id);
          return { ok: true };
        }
        await finaliser(sb, v, segments);
      } catch (e) {
        await sb
          .from("videos_ia")
          .update({ statut: "echouee", erreur: texte(e) })
          .eq("id", v.id);
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, erreur: texte(e) };
    }
  });

export const studioVideoActif = createServerFn({ method: "GET" }).handler(
  async () => ({ actif: xaiConfigure() }),
);
