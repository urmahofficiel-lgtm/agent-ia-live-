import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { demanderIA } from "./ia.server";
import { lireSite } from "./site.server";
import { voixOff } from "./voix.server";
import { tonVoix } from "./marches";
import { utilisateurDepuisJeton } from "./supabase-serveur";
import { chercherSequences, estFichierStudio, monterMontage, preparerMedias, type Sequence } from "./montage.server";
import { genererClipIA, moteursDisponibles, type MoteurVideoIA } from "./video-ia.server";
import { genererImage } from "./ia.server";
import { photo } from "./pexels.server";
import { consignePlan, dureesScenes, lirePlan, planValide, type PlanMontage } from "./montage";

type Resultat<T = object> = ({ ok: true } & T) | { ok: false; erreur: string };
const jeton = z.string().min(10);
const message = (e: unknown) => (e instanceof Error ? e.message : "Erreur inattendue.");

// 1. Plan de montage écrit par l'IA à partir d'un lien ou d'un sujet. Chaque
// scène reçoit un aperçu de la séquence filmée proposée.
export const preparerMontage = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        jeton,
        lien: z.string().max(2000).optional(),
        sujet: z.string().max(1000).optional(),
        duree: z.number().int().min(15).max(60).default(30),
      })
      .refine((x) => Boolean(x.lien?.trim() || x.sujet?.trim()), "Donnez un lien ou un sujet.")
      .parse(input),
  )
  .handler(async ({ data }): Promise<Resultat<{ id: string; plan: PlanMontage }>> => {
    try {
      const { sb } = await utilisateurDepuisJeton(data.jeton);
      let extrait = "";
      if (data.lien?.trim()) {
        const site = await lireSite(data.lien.trim());
        extrait = site.pages
          .map((p) => [p.titre, p.description, p.texte].filter(Boolean).join("\n"))
          .join("\n---\n")
          .slice(0, 4000);
      }
      const { data: contexte } = await sb.rpc("mon_contexte_marque");
      let plan: PlanMontage | null = null;
      for (let essai = 0; essai < 2 && !plan; essai++) {
        plan = lirePlan(
          await demanderIA(consignePlan({ lien: data.lien?.trim(), sujet: data.sujet?.trim(), extrait }, (contexte as string | null) ?? null, data.duree), {
            systeme: "Tu es monteur vidéo expert des réseaux sociaux. Tu réponds uniquement en JSON valide.",
            maxTokens: 3000,
            delaiTotal: 90_000,
          }),
        );
      }
      if (!plan) return { ok: false, erreur: "L'IA n'a pas réussi à écrire le plan. Réessayez dans une minute." };
      // Aperçu de la séquence proposée pour chaque scène filmée.
      const apercus = await Promise.all(
        plan.scenes.map((s) => (s.source === "video" && s.recherche ? chercherSequences(s.recherche, 1).catch(() => []) : Promise.resolve([] as Sequence[]))),
      );
      plan = { ...plan, scenes: plan.scenes.map((s, i) => (apercus[i][0] ? { ...s, choix: apercus[i][0].id, apercu: apercus[i][0].apercu } : s)) };
      const { data: ligne, error } = await sb
        .from("montages")
        .insert({ source: (data.lien || data.sujet || "").trim().slice(0, 2000), plan })
        .select("id")
        .single();
      if (error || !ligne) return { ok: false, erreur: error?.message ?? "Enregistrement impossible." };
      return { ok: true, id: ligne.id as string, plan };
    } catch (e) {
      return { ok: false, erreur: message(e) };
    }
  });

// Séquences filmées proposées pour une scène (choix dans l'éditeur).
export const sequencesScene = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ jeton, recherche: z.string().min(2).max(80) }).parse(input))
  .handler(async ({ data }): Promise<Resultat<{ sequences: Sequence[] }>> => {
    try {
      await utilisateurDepuisJeton(data.jeton);
      return { ok: true, sequences: await chercherSequences(data.recherche, 8) };
    } catch (e) {
      return { ok: false, erreur: message(e) };
    }
  });

// 2. Montage du plan relu : voix off, médias de chaque scène, effets,
// transitions, emojis, sons. Moins de 5 minutes.
export const monterLeMontage = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ jeton, id: z.string().uuid(), plan: z.unknown() }).parse(input))
  .handler(async ({ data }): Promise<Resultat<{ video_url: string }>> => {
    const debut = Date.now();
    let sb: Awaited<ReturnType<typeof utilisateurDepuisJeton>>["sb"] | null = null;
    try {
      const u = await utilisateurDepuisJeton(data.jeton);
      sb = u.sb;
      const plan = lirePlan(data.plan);
      if (!plan) return { ok: false, erreur: "Plan illisible : il faut au moins 2 scènes avec une phrase." };
      const invalide = planValide(plan);
      if (invalide) return { ok: false, erreur: invalide };
      const { error: errMaj } = await sb.from("montages").update({ plan, statut: "montage", erreur: null }).eq("id", data.id);
      if (errMaj) return { ok: false, erreur: errMaj.message };

      const voix = await voixOff(plan.scenes.map((s) => s.phrase).join(" "), tonVoix(null, true), plan.voix).catch(() => null);
      const d = dureesScenes(plan.scenes, voix?.duree);
      const { data: noms } = await sb.rpc("mes_captures_appli");
      const liens = ((noms ?? []) as string[]).slice(0, 6).map((nom) => sb!.storage.from("captures").getPublicUrl(nom).data.publicUrl);
      const captures = plan.scenes.some((s) => s.source === "capture")
        ? (
            await Promise.all(
              liens.map(async (l) => {
                const r = await fetch(l, { signal: AbortSignal.timeout(12_000) }).catch(() => null);
                return r?.ok ? Buffer.from(await r.arrayBuffer()) : null;
              }),
            )
          ).flatMap((b) => (b && b.length > 5000 ? [b] : []))
        : [];
      const medias = await preparerMedias(plan.scenes, d, captures, debut + 200_000, () => {}, u.user.id);
      const mp4 = await monterMontage(plan, medias, d, voix);

      const chemin = `${u.user.id}/montage-${data.id}-${Date.now()}.mp4`;
      const { error } = await sb.storage.from("videos").upload(chemin, mp4, { contentType: "video/mp4" });
      if (error) throw new Error(`Enregistrement de la vidéo impossible : ${error.message}`);
      const video_url = sb.storage.from("videos").getPublicUrl(chemin).data.publicUrl;
      await sb.from("montages").update({ statut: "pret", video_url, erreur: null }).eq("id", data.id);
      return { ok: true, video_url };
    } catch (e) {
      await sb?.from("montages").update({ statut: "echec", erreur: message(e).slice(0, 500) }).eq("id", data.id);
      return { ok: false, erreur: message(e) };
    }
  });

// Moteurs de vidéo IA utilisables (clés présentes dans Vercel).
export const moteursVideoIA = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ jeton }).parse(input))
  .handler(async ({ data }) => {
    await utilisateurDepuisJeton(data.jeton);
    return moteursDisponibles();
  });

// 3. Vidéo IA d'une scène : une image de départ (votre photo, la vignette de
// la séquence choisie, une photo Pexels ou une image IA), animée par un
// modèle chinois gratuit (Wan 2.2 ou CogVideoX-Flash). Le clip est rangé dans
// le stockage du Studio et utilisé tel quel au montage.
export const animerScene = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        jeton,
        moteur: z.enum(["wan", "cogvideox"]),
        mouvement: z.string().max(300).default(""),
        recherche: z.string().max(80).default(""),
        prompt: z.string().max(300).default(""),
        image_url: z.string().url().nullable().default(null),
        duree: z.number().min(2).max(5).default(4),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<Resultat<{ video_url: string; image: string }>> => {
    const debut = Date.now();
    try {
      const { sb, user } = await utilisateurDepuisJeton(data.jeton);
      if (!moteursDisponibles().some((m) => m.id === data.moteur)) return { ok: false, erreur: "Ce moteur n'est pas configuré (clé absente dans Vercel)." };

      // Image de départ : seulement des adresses sûres (Studio ou Pexels).
      let image: Buffer | null = null;
      let origine = "";
      const url = data.image_url;
      if (url && (estFichierStudio(url, user.id) || url.startsWith("https://images.pexels.com/"))) {
        const r = await fetch(url, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
        if (r?.ok) {
          image = Buffer.from(await r.arrayBuffer());
          origine = estFichierStudio(url, user.id) ? "votre photo" : "la séquence choisie";
        }
      }
      if (!image && data.recherche.trim()) {
        image = await photo(data.recherche.trim(), "portrait").catch(() => null);
        if (image) origine = "une photo Pexels";
      }
      if (!image && (data.prompt.trim() || data.recherche.trim())) {
        const img = await genererImage(`${data.prompt.trim() || data.recherche.trim()}. Vertical 9:16 composition, realistic photo, no text.`, "tiktok");
        image = Buffer.from(img.base64, "base64");
        origine = "une image IA";
      }
      if (!image) return { ok: false, erreur: "Il faut une image de départ : choisissez une photo, une séquence ou écrivez une recherche." };

      const mp4 = await genererClipIA(data.moteur as MoteurVideoIA, image, data.mouvement || data.prompt || data.recherche, data.duree, Math.max(60_000, 270_000 - (Date.now() - debut)));
      const chemin = `${user.id}/ia-${data.moteur}-${Date.now()}.mp4`;
      const { error } = await sb.storage.from("studio").upload(chemin, mp4, { contentType: "video/mp4" });
      if (error) return { ok: false, erreur: `Enregistrement de la vidéo IA impossible : ${error.message}` };
      return { ok: true, video_url: sb.storage.from("studio").getPublicUrl(chemin).data.publicUrl, image: origine };
    } catch (e) {
      return { ok: false, erreur: message(e) };
    }
  });
