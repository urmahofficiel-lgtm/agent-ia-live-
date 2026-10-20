import { PLATEFORMES } from "./plateformes";
import { demanderIA, genererImage } from "./ia.server";
import { choisirCaptures, consigneScript, durees, imposerScenesProduit, lireScript, normaliserScript, scriptDeSecours } from "./video";
import { monterVideo } from "./video.server";
import { voixConfiguree, voixOff } from "./voix.server";
import { tonVoix } from "./marches";
import { estJournee } from "./journee";
import { pexelsConfigure, photo, sequenceVerticale } from "./pexels.server";
import { couleurDuSite, visuelsDuSite } from "./site.server";
import { nomStyleVideo, type StyleVideo } from "./styles";
import { conversationDeSecours, consigneConversation, lireConversation, minutage, scenarioPour } from "./conversation-video";
import { monterConversation } from "./conversation-video.server";
import { fabriquerStudio } from "./studio-auto.server";

// Fabrication d'une vidéo verticale (script IA, captures de l'appli ou du
// site, séquences Pexels, voix off, montage). Utilisée par le bouton « Créer
// une vidéo » et par le moteur pour les Reels automatiques : chacun fournit
// son journal, sa mise à jour de la publication, son dépôt du fichier et les
// liens des captures de l'application de l'utilisateur.
export type AtelierVideo = {
  journal: (niveau: "info" | "action" | "erreur", message: string) => PromiseLike<unknown>;
  etat: (champs: Record<string, unknown>) => PromiseLike<unknown>;
  deposer: (mp4: Buffer) => Promise<string>;
  captures?: () => PromiseLike<string[]>;
};

// Télécharge les captures de l'application (stockage du projet), celles qui
// ne répondent pas sont ignorées.
async function telechargerCaptures(liens: string[]): Promise<Buffer[]> {
  const images = await Promise.all(
    liens.map(async (lien) => {
      try {
        const r = await fetch(lien, { signal: AbortSignal.timeout(12_000) });
        if (!r.ok || !/image\/(png|jpe?g|webp)/.test(r.headers.get("content-type") ?? "")) return null;
        const donnees = Buffer.from(await r.arrayBuffer());
        return donnees.length > 5_000 && donnees.length < 8_000_000 ? donnees : null;
      } catch {
        return null;
      }
    }),
  );
  return images.flatMap((i) => (i ? [i] : []));
}

// `marche` : langue et pays du compte visé (script, voix et repères dans sa langue).
export type SujetVideo = { id: string; plateforme: string | null; titre: string; consigne: string; brouillon?: string | null; marche?: string | null };

// `style` : classique (par défaut), ugc, avant_apres, etapes, top3 ou journee
// (toujours imposé aux publications de la série « Une journée de… »).
export async function fabriquerVideo(
  t: SujetVideo,
  contexte: string | null,
  siteMarque: string | null,
  { journal, etat, deposer, captures: liensCaptures }: AtelierVideo,
  style: StyleVideo = "classique",
) {
  if (estJournee(t.consigne)) style = "journee";
  if (style === "studio") {
    try {
      return await fabriquerStudio(t, contexte, { journal, etat, deposer, captures: liensCaptures });
    } catch (err) {
      // Montage Studio impossible : la vidéo classique prend le relais.
      await journal("erreur", `Vidéo Studio impossible (${err instanceof Error ? err.message.slice(0, 120) : "erreur"}) : vidéo classique à la place.`);
      style = t.plateforme === "tiktok" ? "ugc" : "classique";
    }
  }
  if (style === "conversation") {
    try {
      return await fabriquerConversation(t, contexte, siteMarque, { journal, etat, deposer });
    } catch (err) {
      // Montage impossible : la vidéo classique prend le relais.
      await journal("erreur", `Vidéo conversation impossible (${err instanceof Error ? err.message.slice(0, 120) : "erreur"}) : vidéo classique à la place.`);
      style = t.plateforme === "tiktok" ? "ugc" : "classique";
    }
  }
  const debutVideo = Date.now();
  const reseau = PLATEFORMES.find((p) => p.id === t.plateforme)?.nom ?? "TikTok, Reels et Shorts";
  await etat({ video_etat: "en_cours", video_erreur: null, video_debut: new Date().toISOString(), video_style: style });

  // Vraies vues du produit : les captures de l'application de l'utilisateur
  // d'abord (quatre : celles qui parlent du sujet, puis d'autres qui changent
  // d'une vidéo à l'autre), sinon les images lues
  // sur le site de la marque ; et la couleur du site, pour les surlignages des
  // styles autres que classique. En parallèle.
  const site = siteMarque || contexte?.match(/Site \/ lien[^:]*: (\S+)/)?.[1] || "";
  const [visuelsSite, accent, ecransAppli] = await Promise.all([
    site ? visuelsDuSite(site).catch(() => []) : [],
    site && style !== "classique" ? couleurDuSite(site).catch(() => null) : null,
    // Captures de l'application : seulement sur TikTok (et la vidéo promo, faite à part).
    liensCaptures && t.plateforme === "tiktok"
      ? Promise.resolve(liensCaptures())
          .then((liens) => telechargerCaptures(choisirCaptures(liens, t.id, 4, `${t.titre} ${t.consigne}`)))
          .catch(() => [] as Buffer[])
      : ([] as Buffer[]),
  ]);
  const capturesSite = visuelsSite.filter((v) => v.source !== "icone");
  if (ecransAppli.length) await journal("info", `📱 ${ecransAppli.length} capture(s) de votre application pour montrer le produit.`);
  else if (capturesSite.length) await journal("info", `🖥️ ${capturesSite.length} visuel(s) de votre site récupéré(s) pour montrer le produit.`);
  const produitVisible = ecransAppli.length > 0 || capturesSite.length > 0;

  await journal("action", `🎬 Écriture du script vidéo${style === "classique" ? "" : ` (style ${nomStyleVideo(style)})`} : « ${t.titre} »`);
  // Budget serré : la fonction entière doit tenir sous les 5 minutes de Vercel.
  const finScript = Date.now() + 80_000;
  let script = null;
  for (let essai = 0; essai < 2 && !script && Date.now() < finScript - 10_000; essai++) {
    try {
      script = lireScript(
        await demanderIA(consigneScript(t, contexte, reseau, produitVisible, style, t.marche), {
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
  if (produitVisible) script = imposerScenesProduit(script, style);
  await journal("info", `Script : ${script.scenes.length} scènes — « ${script.scenes[0].texte_ecran} »`);

  let voix = null;
  if (voixConfiguree()) {
    await journal("action", "🎙️ Enregistrement de la voix off (Gemini)…");
    voix = await voixOff(script.scenes.map((s) => s.voix).join(" "), tonVoix(t.marche, style === "ugc", style === "journee"));
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
  const partage = capturesSite.find((v) => v.source === "og");
  const ecrans = ecransAppli.length ? ecransAppli : capturesSite.filter((v) => v !== partage).map((v) => v.donnees);
  let prochainEcran = 0;
  const visuelProduit = (i: number) => {
    if (!produitVisible) return null;
    if (i === script.scenes.length - 1 && partage) return partage.donnees;
    const liste = ecrans.length ? ecrans : capturesSite.map((v) => v.donnees);
    return liste[prochainEcran++ % liste.length];
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
    { style, accent: accent ?? undefined, marche: t.marche, titre: style === "journee" ? t.titre : undefined },
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

// Vidéo « conversation » : l'IA écrit une discussion vécue par la clientèle
// (situation différente à chaque publication), montée bulle après bulle.
async function fabriquerConversation(
  t: SujetVideo,
  contexte: string | null,
  siteMarque: string | null,
  { journal, etat, deposer }: Pick<AtelierVideo, "journal" | "etat" | "deposer">,
) {
  await etat({ video_etat: "en_cours", video_erreur: null, video_debut: new Date().toISOString(), video_style: "conversation" });
  const scenario = scenarioPour(t.id);
  await journal("action", `💬 Écriture d'une conversation (${scenario}) : « ${t.titre} »`);
  let script = null;
  for (let essai = 0; essai < 2 && !script; essai++) {
    try {
      script = lireConversation(
        await demanderIA(consigneConversation(t, contexte, scenario, t.marche), {
          systeme: "Tu es scénariste de vidéos virales pour TikTok et Reels. Tu réponds uniquement en JSON valide.",
          maxTokens: 1500,
          delaiTotal: 70_000,
        }),
      );
    } catch (err) {
      console.warn("Conversation : IA indisponible", err instanceof Error ? err.message : err);
      break;
    }
  }
  if (!script) {
    if (t.marche && t.marche !== "fr-FR") throw new Error("conversation non écrite");
    script = conversationDeSecours(siteMarque || "notre site");
    await journal("info", "IA occupée : conversation de secours utilisée.");
  }
  await journal("info", `Conversation prête : ${script.messages.length} messages — « ${script.accroche} »`);
  await journal("action", "✂️ Montage de la conversation (bulles, sons, question finale)…");
  const mp4 = await monterConversation(script);
  const video_url = await deposer(mp4);
  await etat({
    // La légende va avec l'histoire racontée (elle invite à commenter).
    brouillon: script.legende || t.brouillon,
    video_url,
    video_script: script,
    video_le: new Date().toISOString(),
    video_etat: "prete",
    video_erreur: null,
    video_style: "conversation",
  });
  await journal("info", `✅ Vidéo conversation prête (${Math.round(minutage(script.messages).total)} s, ${(mp4.length / 1e6).toFixed(1)} Mo).`);
  return video_url;
}
