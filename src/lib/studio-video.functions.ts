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
import { choisirVoix, tonVoix, type AnalyseScene } from "./personnage";
import { analyserScene } from "./personnage.server";
import {
  compteHF,
  hfConfigure,
  imageVersVideoHF,
  synchroniserLevresHF,
} from "./hf.server";
import { ajouterVoix, derniereImage, recollerVideos } from "./video.server";
import { enWav, voixOff } from "./voix.server";
import { utilisateurDepuisJeton } from "./supabase-serveur";

// Studio vidéo IA (gratuit, Hugging Face + Gemini) : la page appelle
// « avancer » en boucle ; chaque appel fait UNE étape (une fonction serveur
// dure 5 min au plus) :
//   1. un morceau d'animation de 5 s (Wan 2.2), autant de fois que nécessaire ;
//   2. recollage ; si le personnage parle : voix adaptée (Gemini) ;
//   3. lèvres synchronisées sur la voix (LatentSync), sinon voix posée telle quelle.

type Resultat<T = object> = ({ ok: true } & T) | { ok: false; erreur: string };
type Sb = Awaited<ReturnType<typeof utilisateurDepuisJeton>>["sb"];
type Voix = AnalyseScene & {
  voix: string;
  levres?: "ok" | "non";
  note?: string;
};

const texte = (e: unknown) =>
  e instanceof Error ? e.message : "Erreur inattendue.";
const PAR_JOUR = 10;
const DELAI_ETAPE_MS = 260_000;
const VERROU_MS = 5 * 60_000;

type VideoIA = {
  id: string;
  user_id: string;
  statut: string;
  etape: "morceaux" | "levres";
  image_chemin: string;
  prompt: string;
  duree: number;
  segments: Morceau[];
  voix: Voix | null;
  video_muette: string | null;
  audio_chemin: string | null;
};

const mimeImage = (chemin: string) =>
  chemin.endsWith(".png")
    ? "image/png"
    : chemin.endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";

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

      // Personnage (âge, sexe) et phrase à dire (langue) : facultatif, la
      // vidéo se fait sans voix si l'analyse échoue.
      const image = await lireFichier(sb, "animations", data.image);
      const analyse = await analyserScene(
        image,
        mimeImage(data.image),
        data.prompt,
        data.duree,
      ).catch(() => null);
      const voix: Voix | null = analyse
        ? { ...analyse, voix: choisirVoix(analyse) }
        : null;

      const { data: ligne, error } = await sb
        .from("videos_ia")
        .insert({
          user_id: user.id,
          image_chemin: data.image,
          prompt: data.prompt,
          duree: data.duree,
          statut: "en_cours",
          segments: [],
          voix,
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

async function deposer(
  sb: Sb,
  chemin: string,
  donnees: Uint8Array | Buffer,
  type: string,
  seau = "videos",
) {
  const { error } = await sb.storage
    .from(seau)
    .upload(chemin, donnees, { contentType: type, upsert: true });
  if (error) throw new Error(`Enregistrement impossible : ${error.message}`);
}

async function messageRefus(e: unknown) {
  const m = texte(e);
  if (!m.startsWith("Hugging Face a refusé")) return m;
  const compte = await compteHF();
  return compte.valide
    ? "Quota gratuit de Hugging Face épuisé pour aujourd'hui (ou modèle saturé). Appuyez sur « Reprendre » plus tard : les morceaux déjà faits sont gardés."
    : "La clé HF_TOKEN est refusée par Hugging Face : recréez-la (type Read) dans Vercel.";
}

// Vidéo finale publiée ; les fichiers intermédiaires sont supprimés.
async function terminer(
  sb: Sb,
  v: VideoIA,
  finale: Uint8Array | Buffer,
  voix: Voix | null,
) {
  const chemin = `${v.user_id}/studio-${v.id}.mp4`;
  await deposer(sb, chemin, finale, "video/mp4");
  const temporaires = [
    ...(v.segments ?? []).map((m) => m.chemin),
    v.video_muette,
  ].filter((c): c is string => Boolean(c));
  if (temporaires.length) await sb.storage.from("videos").remove(temporaires);
  if (v.audio_chemin)
    await sb.storage.from("animations").remove([v.audio_chemin]);
  const resultat_url = sb.storage.from("videos").getPublicUrl(chemin)
    .data.publicUrl;
  await sb
    .from("videos_ia")
    .update({
      statut: "terminee",
      progression: 100,
      resultat_url,
      voix,
      verrou: null,
      erreur: null,
    })
    .eq("id", v.id);
}

async function etapeMorceaux(sb: Sb, v: VideoIA) {
  const morceaux = [...(v.segments ?? [])];
  const total = nombreMorceaux(v.duree);
  // Vidéo lancée avant l'analyse du personnage : on la fait maintenant.
  if (!v.voix && morceaux.length === 0) {
    const a = await analyserScene(
      await lireFichier(sb, "animations", v.image_chemin),
      mimeImage(v.image_chemin),
      v.prompt,
      v.duree,
    ).catch(() => null);
    if (a) {
      v.voix = { ...a, voix: choisirVoix(a) };
      await sb.from("videos_ia").update({ voix: v.voix }).eq("id", v.id);
    }
  }
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
    const consigne = consigneMorceau(v.voix?.consigne_visuelle ?? v.prompt, n);
    const { donnees } = await imageVersVideoHF(
      depart,
      consigne,
      duree,
      async () => undefined,
      DELAI_ETAPE_MS,
    );
    const chemin = `${v.user_id}/studio-${v.id}-${n}.mp4`;
    await deposer(sb, chemin, donnees, "video/mp4");
    morceaux.push({ numero: n, duree, chemin });
    await sb
      .from("videos_ia")
      .update({
        segments: morceaux,
        progression: Math.min(90, progression(v.duree, morceaux.length)),
        verrou: null,
      })
      .eq("id", v.id);
    return;
  }

  // Animation complète : recollage.
  const muette = await recollerVideos(
    await Promise.all(morceaux.map((m) => lireFichier(sb, "videos", m.chemin))),
  );
  if (!v.voix?.parole) return terminer(sb, v, muette, v.voix);

  // Le personnage parle : voix adaptée à son âge, son sexe et la langue.
  const audio = await voixOff(v.voix.parole, tonVoix(v.voix), v.voix.voix);
  if (!audio)
    return terminer(sb, v, muette, {
      ...v.voix,
      note: "Voix indisponible (Gemini) : vidéo sans parole.",
    });
  const video_muette = `${v.user_id}/studio-${v.id}-muette.mp4`;
  const audio_chemin = `${v.user_id}/studio-${v.id}-voix.wav`;
  await deposer(sb, video_muette, muette, "video/mp4");
  await deposer(sb, audio_chemin, enWav(audio), "audio/wav", "animations");
  await sb
    .from("videos_ia")
    .update({
      etape: "levres",
      video_muette,
      audio_chemin,
      progression: 92,
      verrou: null,
    })
    .eq("id", v.id);
}

async function etapeLevres(sb: Sb, v: VideoIA) {
  if (!v.video_muette || !v.audio_chemin || !v.voix)
    throw new Error("Étape voix incomplète : relancez la vidéo.");
  const [muette, voix] = await Promise.all([
    lireFichier(sb, "videos", v.video_muette),
    lireFichier(sb, "animations", v.audio_chemin),
  ]);
  const wav = Buffer.from(voix);
  try {
    const { donnees } = await synchroniserLevresHF(muette, wav, DELAI_ETAPE_MS);
    // La vidéo synchronisée garde la voix ; on s'assure qu'elle a bien le son.
    await terminer(sb, v, await ajouterVoix(donnees, wav), {
      ...v.voix,
      levres: "ok",
    });
  } catch (e) {
    // Lèvres impossibles (quota, pas de visage détecté…) : la voix est posée
    // sur l'animation telle quelle.
    console.warn("Studio vidéo : lèvres", texte(e));
    await terminer(sb, v, await ajouterVoix(muette, wav), {
      ...v.voix,
      levres: "non",
      note: "Voix ajoutée, mais lèvres non synchronisées (visage non détecté ou quota du jour atteint).",
    });
  }
}

export const avancerVideoIA = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), jeton: z.string().min(10) }).parse(input),
  )
  .handler(async ({ data }): Promise<Resultat> => {
    try {
      const { sb } = await utilisateurDepuisJeton(data.jeton);
      // Prise en charge : une seule étape à la fois pour cette vidéo.
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
        if (v.etape === "levres") await etapeLevres(sb, v);
        else await etapeMorceaux(sb, v);
      } catch (e) {
        const message =
          e instanceof Error && e.name === "TimeoutError"
            ? "Le calcul a pris trop de temps (modèle saturé). Appuyez sur « Reprendre » plus tard."
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
