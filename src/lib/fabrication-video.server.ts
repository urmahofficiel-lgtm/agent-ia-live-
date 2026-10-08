import { PLATEFORMES } from "./plateformes";
import { demanderIA, genererImage } from "./ia.server";
import { consigneScript, durees, imposerScenesProduit, lireScript, normaliserScript, scriptDeSecours } from "./video";
import { monterVideo } from "./video.server";
import { voixConfiguree, voixOff } from "./voix.server";
import { tonVoix } from "./marches";
import { pexelsConfigure, photo, sequenceVerticale } from "./pexels.server";
import { couleurDuSite, visuelsDuSite } from "./site.server";
import { nomStyleVideo, type StyleVideo } from "./styles";

// Fabrication d'une vidéo verticale (script IA, captures du site, séquences
// Pexels, voix off, montage). Utilisée par le bouton « Créer une vidéo » et
// par le moteur pour les Reels automatiques : chacun fournit son journal, sa
// mise à jour de la publication et son dépôt du fichier.
export type AtelierVideo = {
  journal: (niveau: "info" | "action" | "erreur", message: string) => PromiseLike<unknown>;
  etat: (champs: Record<string, unknown>) => PromiseLike<unknown>;
  deposer: (mp4: Buffer) => Promise<string>;
};

// `marche` : langue et pays du compte visé (script, voix et repères dans sa langue).
export type SujetVideo = { id: string; plateforme: string | null; titre: string; consigne: string; brouillon?: string | null; marche?: string | null };

// `style` : classique (par défaut), ugc, avant_apres, etapes ou top3.
export async function fabriquerVideo(
  t: SujetVideo,
  contexte: string | null,
  siteMarque: string | null,
  { journal, etat, deposer }: AtelierVideo,
  style: StyleVideo = "classique",
) {
  const debutVideo = Date.now();
  const reseau = PLATEFORMES.find((p) => p.id === t.plateforme)?.nom ?? "TikTok, Reels et Shorts";
  await etat({ video_etat: "en_cours", video_erreur: null, video_debut: new Date().toISOString(), video_style: style });

  // Vraies captures du produit, lues sur le site de la marque (et sa couleur,
  // pour les surlignages des styles autres que classique), en parallèle.
  const site = siteMarque || contexte?.match(/Site \/ lien[^:]*: (\S+)/)?.[1] || "";
  const [visuelsSite, accent] = await Promise.all([
    site ? visuelsDuSite(site).catch(() => []) : [],
    site && style !== "classique" ? couleurDuSite(site).catch(() => null) : null,
  ]);
  const captures = visuelsSite.filter((v) => v.source !== "icone");
  if (captures.length) await journal("info", `🖥️ ${captures.length} visuel(s) de votre site récupéré(s) pour montrer le produit.`);

  await journal("action", `🎬 Écriture du script vidéo${style === "classique" ? "" : ` (style ${nomStyleVideo(style)})`} : « ${t.titre} »`);
  // Budget serré : la fonction entière doit tenir sous les 5 minutes de Vercel.
  const finScript = Date.now() + 80_000;
  let script = null;
  for (let essai = 0; essai < 2 && !script && Date.now() < finScript - 10_000; essai++) {
    try {
      script = lireScript(
        await demanderIA(consigneScript(t, contexte, reseau, captures.length > 0, style, t.marche), {
          systeme: "Tu es scénariste de vidéos courtes pour les réseaux sociaux. Tu réponds uniquement en JSON valide.",
          maxTokens: 2000,
          delaiTotal: finScript - Date.now(),
        }),
      );
    } catch (err) {
      console.warn("Script vidéo : IA indisponible", err instanceof Error ? err.message : err);
      break;
    }
  }
  if (!script) {
    // IA saturée : script tiré du texte de la publication, la vidéo se fait quand même.
    script = scriptDeSecours({ ...t, brouillon: t.brouillon }, contexte, t.marche);
    await journal("info", "IA occupée : script construit à partir du texte de la publication.");
  }
  script = normaliserScript(script, style);
  if (captures.length) script = imposerScenesProduit(script);
  await journal("info", `Script : ${script.scenes.length} scènes — « ${script.scenes[0].texte_ecran} »`);

  let voix = null;
  if (voixConfiguree()) {
    await journal("action", "🎙️ Enregistrement de la voix off (Gemini)…");
    voix = await voixOff(script.scenes.map((s) => s.voix).join(" "), tonVoix(t.marche, style === "ugc"));
    await journal(voix ? "info" : "erreur", voix ? `Voix off prête (${Math.round(voix.duree)} s).` : "Voix off impossible : vidéo sans voix.");
  }
  const d = durees(script.scenes, voix ? voix.duree + 0.6 : undefined);

  // Pour chaque scène : une capture du produit (scènes « produit »), sinon
  // une séquence filmée Pexels différente à chaque fois, sinon une photo
  // Pexels, sinon une image IA (FLUX) ; les images sont animées au montage.
  const univers = contexte?.match(/Univers visuel[^:]*: (.*)/)?.[1] ?? "";
  const dejaVus = new Set<number>();
  // La dernière scène (appel à l'action) prend l'image de partage du site
  // si elle existe ; les autres scènes produit, les captures dans l'ordre.
  const partage = captures.find((v) => v.source === "og");
  const ecrans = captures.filter((v) => v !== partage);
  let prochainEcran = 0;
  const visuelProduit = (i: number) => {
    if (!captures.length) return null;
    if (i === script.scenes.length - 1 && partage) return partage.donnees;
    const liste = ecrans.length ? ecrans : captures;
    return liste[prochainEcran++ % liste.length].donnees;
  };
  const medias: { image?: Buffer; clip?: Buffer; cadre?: boolean }[] = [];
  if (pexelsConfigure()) await journal("action", "🎥 Recherche de séquences filmées (Pexels)…");
  // Scènes traitées une à une : la liste des séquences déjà utilisées doit
  // être à jour avant de chercher la suivante.
  for (const [i, s] of script.scenes.entries()) {
    const produit = s.type_visuel === "produit" ? visuelProduit(i) : null;
    if (produit) {
      medias.push({ image: produit, cadre: true });
      continue;
    }
    if (pexelsConfigure() && s.recherche_stock) {
      const clip = await sequenceVerticale(s.recherche_stock, d[i], dejaVus).catch(() => null);
      if (clip) {
        medias.push({ clip });
        continue;
      }
      const img = await photo(s.recherche_stock, "portrait", dejaVus).catch(() => null);
      if (img) {
        medias.push({ image: img });
        continue;
      }
    }
    // Image IA en dernier recours, seulement s'il reste du temps
    // (la fonction doit finir en moins de 5 minutes).
    if (Date.now() - debutVideo > 170_000) {
      const secours = visuelProduit(i);
      if (!secours) throw new Error("Temps insuffisant pour créer les images des scènes.");
      medias.push({ image: secours, cadre: true });
      continue;
    }
    const img = await genererImage(`${s.visuel}. ${univers} Vertical 9:16 composition, realistic photo, no text.`, "tiktok");
    medias.push({ image: Buffer.from(img.base64, "base64") });
  }
  const nbClips = medias.filter((m) => m.clip).length;
  await journal("info", `Scènes prêtes : ${medias.filter((m) => m.cadre).length} vue(s) du produit, ${nbClips} séquence(s) filmée(s), ${medias.length - nbClips - medias.filter((m) => m.cadre).length} image(s).`);

  await journal("action", "✂️ Montage de la vidéo (zoom, textes, voix)…");
  const mp4 = await monterVideo(
    script.scenes.map((s, i) => ({ ...medias[i], texte_ecran: s.texte_ecran, voix: s.voix, repere: s.repere })),
    d,
    voix ?? undefined,
    { style, accent: accent ?? undefined, marche: t.marche },
  );

  const video_url = await deposer(mp4);
  await etat({
    brouillon: t.brouillon || script.legende,
    video_url,
    video_script: script,
    video_le: new Date().toISOString(),
    video_etat: "prete",
    video_erreur: null,
    video_style: style,
  });
  await journal("info", `✅ Vidéo prête (${Math.round(d.reduce((a, b) => a + b, 0))} s, ${(mp4.length / 1e6).toFixed(1)} Mo).`);
  return video_url;
}
