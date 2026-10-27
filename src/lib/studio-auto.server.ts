import { demanderIA, genererImage } from "./ia.server";
import { voixOff } from "./voix.server";
import { tonVoix } from "./marches";
import { monterMontage, preparerMedias } from "./montage.server";
import { genererClipIA, moteursDisponibles } from "./video-ia.server";
import { MODELES, appliquerModele, consignePlan, dureesScenes, lirePlan, modelePour, type PlanMontage } from "./montage";
import { estCroissance, estSansPub } from "./croissance";
import type { AtelierVideo, SujetVideo } from "./fabrication-video.server";

// Vidéos automatiques de l'agent, faites comme dans le Studio montage : plan
// écrit par l'IA phrase par phrase (accroche, problème, solution, preuve,
// appel à l'action), modèle adapté au réseau (TikTok et Instagram : viral ;
// Facebook : dynamique…), voix off, séquences filmées, vraie vidéo IA (Wan)
// pour l'accroche quand le quota gratuit le permet, sous-titres mot à mot,
// emojis, effets et sons. Toute erreur remonte : la vidéo classique prend le relais.
export async function fabriquerStudio(
  t: SujetVideo,
  contexte: string | null,
  { journal, etat, deposer, captures: liensCaptures }: AtelierVideo,
) {
  const debut = Date.now();
  const modele = modelePour(t.plateforme);
  const nomModele = MODELES.find((m) => m.id === modele)?.nom ?? modele;
  await etat({ video_etat: "en_cours", video_erreur: null, video_debut: new Date().toISOString(), video_style: "studio" });
  await journal("action", `🎬 Studio : plan de montage « ${nomModele} » pour « ${t.titre} »`);

  // 1. Plan : le sujet et le texte de la publication sur ce réseau (même message).
  // Mode croissance : vidéo courte (regardée jusqu'au bout), fin sans pub.
  const croissance = estCroissance(t.consigne) ? { sansPub: estSansPub(t.consigne) } : null;
  let plan: PlanMontage | null = null;
  for (let essai = 0; essai < 2 && !plan && Date.now() - debut < 70_000; essai++) {
    try {
      plan = lirePlan(
        await demanderIA(
          consignePlan(
            { sujet: `${t.titre}. ${t.consigne}`.slice(0, 900), extrait: t.brouillon ? `Texte publié avec la vidéo (même message, ne le recopie pas) :\n${t.brouillon}` : undefined },
            contexte,
            croissance ? 18 : 25,
            t.marche,
            croissance,
          ),
          {
            systeme: "Tu es monteur vidéo expert des réseaux sociaux. Tu réponds uniquement en JSON valide.",
            maxTokens: 3000,
            delaiTotal: Math.max(20_000, 70_000 - (Date.now() - debut)),
          },
        ),
      );
    } catch (e) {
      await journal("info", `Plan de montage, essai ${essai + 1} : ${e instanceof Error ? e.message.slice(0, 120) : "IA indisponible"}`);
    }
  }
  if (!plan) throw new Error("plan de montage non écrit (IA indisponible)");
  plan = appliquerModele(plan, modele);
  await journal("info", `Plan : ${plan.scenes.length} scènes — « ${plan.accroche} »`);

  // 2. Voix off et durées.
  const voix = await voixOff(plan.scenes.map((s) => s.phrase).join(" "), tonVoix(t.marche, true), plan.voix).catch(() => null);
  const d = dureesScenes(plan.scenes, voix?.duree);
  await journal(voix ? "info" : "erreur", voix ? `🎙️ Voix off prête (${Math.round(voix.duree)} s).` : "Voix off impossible : vidéo sans voix.");

  // 3. Médias : images IA, captures de l'appli, et l'accroche en vraie
  // vidéo IA (Wan 2.2) en parallèle, s'il reste du temps.
  const captures = await telechargerCaptures(liensCaptures ? await Promise.resolve(liensCaptures()).catch(() => []) : []);
  const p = plan;
  const iCle = Math.max(0, p.scenes.findIndex((s) => s.source === "ia_video"));
  const [medias, clip] = await Promise.all([
    preparerMedias(p.scenes, d, captures, debut + 140_000, (m) => journal("info", m), undefined, false),
    (async () => {
      if (!moteursDisponibles().some((m) => m.id === "wan") || Date.now() - debut > 100_000) return null;
      const s = p.scenes[iCle];
      try {
        const image = Buffer.from((await genererImage(`${s.prompt || s.recherche || s.phrase}. Vertical 9:16 composition, realistic photo, no text.`, "tiktok")).base64, "base64");
        return await genererClipIA("wan", image, s.mouvement || s.prompt || s.recherche, Math.min(5, d[iCle]), Math.max(30_000, 140_000 - (Date.now() - debut)));
      } catch (e) {
        await journal("info", `Vidéo IA de l'accroche impossible (${e instanceof Error ? e.message.slice(0, 100) : "erreur"}) : image à la place.`);
        return null;
      }
    })(),
  ]);
  if (clip) {
    medias[iCle] = { clip };
    plan.scenes[iCle] = { ...plan.scenes[iCle], source: "ia_video", vitesse: d[iCle] > 5 ? 0.75 : 1 };
    await journal("info", `✨ Scène ${iCle + 1} en vraie vidéo IA (Wan 2.2).`);
  }

  // 4. Montage et dépôt.
  await journal("action", "✂️ Montage Studio (sous-titres, effets, transitions, emojis, sons)…");
  const mp4 = await monterMontage(plan, medias, d, voix, (m) => journal("info", m));
  const video_url = await deposer(mp4);
  await etat({
    // Le texte de la publication reste celui écrit pour ce réseau.
    brouillon: t.brouillon || plan.legende,
    video_url,
    video_script: plan,
    video_le: new Date().toISOString(),
    video_etat: "prete",
    video_erreur: null,
    video_style: "studio",
  });
  await journal("info", `✅ Vidéo Studio prête (${Math.round(d.reduce((a, b) => a + b, 0))} s, ${(mp4.length / 1e6).toFixed(1)} Mo, ${Math.round((Date.now() - debut) / 1000)} s de fabrication).`);
  return video_url;
}

// Captures de l'application (6 au plus) pour les scènes « capture ».
async function telechargerCaptures(liens: string[]) {
  const images = await Promise.all(
    liens.slice(0, 6).map(async (l) => {
      const r = await fetch(l, { signal: AbortSignal.timeout(12_000) }).catch(() => null);
      if (!r?.ok) return null;
      const b = Buffer.from(await r.arrayBuffer());
      return b.length > 5_000 && b.length < 8_000_000 ? b : null;
    }),
  );
  return images.flatMap((i) => (i ? [i] : []));
}
