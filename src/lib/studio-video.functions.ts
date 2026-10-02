import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  DUREES,
  consigneMorceau,
  dureeMorceau,
  nombreMorceaux,
  progression,
  type Morceau,
} from "./studio-video";
import { compteHF, hfConfigure, imageVersVideoHF } from "./hf.server";
import { derniereImage, recollerVideos } from "./video.server";
import { utilisateurDepuisJeton } from "./supabase-serveur";

// Studio vidéo IA (gratuit, Hugging Face) : la page appelle « avancer » en
// boucle ; chaque appel calcule UN morceau de 5 s (une fonction serveur dure
// 5 min au plus), puis le dernier appel recolle la vidéo finale.

type Resultat<T = object> = ({ ok: true } & T) | { ok: false; erreur: string };
type Sb = Awaited<ReturnType<typeof utilisateurDepuisJeton>>["sb"];

const texte = (e: unknown) =>
  e instanceof Error ? e.message : "Erreur inattendue.";
const PAR_JOUR = 10;
const DELAI_MORCEAU_MS = 260_000;
const VERROU_MS = 5 * 60_000;

type VideoIA = {
  id: string;
  user_id: string;
  statut: string;
  image_chemin: string;
  prompt: string;
  duree: number;
  segments: Morceau[];
};

export const lancerVideoIA = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        image: z.string().min(3).max(300),
        prompt: z.string().trim().min(3).max(2000),
        duree: z
          .number()
          .refine((d) => (DUREES as readonly number[]).includes(d)),
        jeton: z.string().min(10),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<Resultat<{ id: string }>> => {
    if (!hfConfigure())
      return {
        ok: false,
        erreur: "Studio vidéo non activé : la clé HF_TOKEN manque dans Vercel.",
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
      const { data: ligne, error } = await sb
        .from("videos_ia")
        .insert({
          user_id: user.id,
          image_chemin: data.image,
          prompt: data.prompt,
          duree: data.duree,
          statut: "en_cours",
          segments: [],
        })
        .select("id")
        .single();
      if (error || !ligne)
        return {
          ok: false,
          erreur: error?.message ?? "Enregistrement impossible.",
        };
      return { ok: true, id: ligne.id };
    } catch (e) {
      return { ok: false, erreur: texte(e) };
    }
  });

async function lireFichier(sb: Sb, seau: string, chemin: string) {
  const { data } = await sb.storage.from(seau).download(chemin);
  if (!data) throw new Error("Fichier introuvable : relancez la vidéo.");
  return new Uint8Array(await data.arrayBuffer());
}

async function messageRefus(e: unknown) {
  const m = texte(e);
  if (!m.startsWith("Hugging Face a refusé")) return m;
  const compte = await compteHF();
  return compte.valide
    ? "Quota gratuit de Hugging Face épuisé pour aujourd'hui (ou modèle saturé). Réessayez plus tard ou demain."
    : "La clé HF_TOKEN est refusée par Hugging Face : recréez-la (type Read) dans Vercel.";
}

export const avancerVideoIA = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), jeton: z.string().min(10) }).parse(input),
  )
  .handler(async ({ data }): Promise<Resultat> => {
    try {
      const { sb } = await utilisateurDepuisJeton(data.jeton);
      // Prise en charge : un seul calcul à la fois pour cette vidéo.
      const libre = new Date(Date.now() - VERROU_MS).toISOString();
      const { data: v } = await sb
        .from("videos_ia")
        .update({ verrou: new Date().toISOString() })
        .eq("id", data.id)
        .eq("statut", "en_cours")
        .or(`verrou.is.null,verrou.lt.${libre}`)
        .select("*")
        .maybeSingle<VideoIA>();
      if (!v) return { ok: true };
      try {
        const morceaux = [...(v.segments ?? [])];
        const total = nombreMorceaux(v.duree);
        if (morceaux.length < total) {
          const n = morceaux.length;
          // Point de départ : l'image importée, puis la dernière image du morceau précédent.
          const depart =
            n === 0
              ? {
                  donnees: new Blob([
                    await lireFichier(sb, "animations", v.image_chemin),
                  ]),
                  nom: v.image_chemin.split("/").pop() ?? "image.jpg",
                }
              : {
                  donnees: new Blob([
                    new Uint8Array(
                      await derniereImage(
                        await lireFichier(sb, "videos", morceaux[n - 1].chemin),
                      ),
                    ),
                  ]),
                  nom: "suite.jpg",
                };
          const duree = dureeMorceau(v.duree, n);
          const { donnees } = await imageVersVideoHF(
            depart,
            consigneMorceau(v.prompt, n),
            duree,
            async () => undefined,
            DELAI_MORCEAU_MS,
          );
          const chemin = `${v.user_id}/studio-${v.id}-${n}.mp4`;
          const { error } = await sb.storage
            .from("videos")
            .upload(chemin, donnees, {
              contentType: "video/mp4",
              upsert: true,
            });
          if (error)
            throw new Error(
              `Enregistrement du morceau impossible : ${error.message}`,
            );
          morceaux.push({ numero: n, duree, chemin });
          await sb
            .from("videos_ia")
            .update({
              segments: morceaux,
              progression: progression(v.duree, morceaux.length),
              verrou: null,
            })
            .eq("id", v.id);
          return { ok: true };
        }
        // Tous les morceaux sont prêts : vidéo finale.
        const finale = await recollerVideos(
          await Promise.all(
            morceaux.map((m) => lireFichier(sb, "videos", m.chemin)),
          ),
        );
        const chemin = `${v.user_id}/studio-${v.id}.mp4`;
        const { error } = await sb.storage
          .from("videos")
          .upload(chemin, finale, { contentType: "video/mp4", upsert: true });
        if (error)
          throw new Error(
            `Enregistrement de la vidéo impossible : ${error.message}`,
          );
        await sb.storage.from("videos").remove(morceaux.map((m) => m.chemin));
        const resultat_url = sb.storage.from("videos").getPublicUrl(chemin)
          .data.publicUrl;
        await sb
          .from("videos_ia")
          .update({
            statut: "terminee",
            progression: 100,
            resultat_url,
            verrou: null,
            erreur: null,
          })
          .eq("id", v.id);
      } catch (e) {
        const message =
          e instanceof Error && e.name === "TimeoutError"
            ? "Le calcul a pris trop de temps (modèle saturé). Réessayez plus tard."
            : await messageRefus(e);
        await sb
          .from("videos_ia")
          .update({ statut: "echouee", erreur: message, verrou: null })
          .eq("id", v.id);
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, erreur: texte(e) };
    }
  });

// Relance une vidéo échouée là où elle s'est arrêtée (morceaux déjà faits gardés).
export const reprendreVideoIA = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), jeton: z.string().min(10) }).parse(input),
  )
  .handler(async ({ data }): Promise<Resultat> => {
    try {
      const { sb } = await utilisateurDepuisJeton(data.jeton);
      const { error } = await sb
        .from("videos_ia")
        .update({ statut: "en_cours", erreur: null, verrou: null })
        .eq("id", data.id)
        .eq("statut", "echouee");
      return error ? { ok: false, erreur: error.message } : { ok: true };
    } catch (e) {
      return { ok: false, erreur: texte(e) };
    }
  });
