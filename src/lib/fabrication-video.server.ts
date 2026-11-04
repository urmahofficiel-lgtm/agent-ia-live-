import { PLATEFORMES } from "./plateformes";
import { demanderIA, genererImage } from "./ia.server";
import { choisirCaptures, consigneScript, durees, imposerScenesProduit, lireScript, normaliserScript, scriptDeSecours } from "./video";
import { extensionImage, monterVideo } from "./video.server";
import type { PlanAnime } from "./hyperframes";
import type { Explication } from "./explication";
import { consigneExplication, dureesSurVoix, lireExplication, phraseFinale, texteVoix } from "./explication-script";
import { MUSIQUE_FOND_BASE64 } from "./generes/musique.server";
import { voixConfiguree, voixOff } from "./voix.server";
import { tonVoix } from "./marches";
import { estJournee } from "./journee";
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
  // Vidéo animée HyperFrames : dépose les images et les sons de la vidéo et
  // rend l'adresse de leur dossier ; le robot de rendu (GitHub Actions) écrit
  // la page animée et la filme.
  animer?: (fichiers: FichierAnime[]) => Promise<string>;
};

export type FichierAnime = { nom: string; donnees: Buffer; type: string };

// Voix Gemini en PCM brut (16 bits, 24 kHz, mono) : en-tête WAV pour le navigateur.
export function wavDepuisPcm(pcm: Buffer, frequence = 24_000) {
  const entete = Buffer.alloc(44);
  entete.write("RIFF", 0);
  entete.writeUInt32LE(36 + pcm.length, 4);
  entete.write("WAVEfmt ", 8);
  entete.writeUInt32LE(16, 16);
  entete.writeUInt16LE(1, 20);
  entete.writeUInt16LE(1, 22);
  entete.writeUInt32LE(frequence, 24);
  entete.writeUInt32LE(frequence * 2, 28);
  entete.writeUInt16LE(2, 32);
  entete.writeUInt16LE(16, 34);
  entete.write("data", 36);
  entete.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([entete, pcm]);
}

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
  { journal, etat, deposer, captures: liensCaptures, animer }: AtelierVideo,
  style: StyleVideo = "classique",
) {
  if (estJournee(t.consigne)) style = "journee";
  // Vidéo animée HyperFrames demandée : elle passe avant les styles Studio et
  // conversation, qui ont leur propre montage (script de style « face caméra »).
  if (animer && (style === "studio" || style === "conversation")) style = "ugc";
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

  // Vidéo « Explication » (format « une astuce par jour », sans visage) quand
  // le rendu HyperFrames est branché ; sinon ou en cas d'échec, la suite.
  if (animer) {
    try {
      if (await fabriquerExplication(t, contexte, ecransAppli, accent ?? (site ? await couleurDuSite(site).catch(() => null) : null), { journal, etat, animer })) return "";
    } catch (err) {
      await journal("info", `Format Explication impossible (${err instanceof Error ? err.message.slice(0, 120) : "erreur"}) : vidéo animée classique à la place.`);
    }
  }

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
  // une image créée par IA pour la scène (jamais de séquence ni de photo de
  // banque d'images, souvent hors sujet) ; les images sont animées au montage.
  const univers = contexte?.match(/Univers visuel[^:]*: (.*)/)?.[1] ?? "";
  // La dernière scène (appel à l'action) prend l'image de partage du site
  // si elle existe ; les autres scènes produit, les captures dans l'ordre.
  const partage = capturesSite.find((v) => v.source === "og");
  const ecrans = ecransAppli.length ? ecransAppli : capturesSite.filter((v) => v !== partage).map((v) => v.donnees);
  let prochainEcran = 0;
  const visuelProduit = (i: number, force = false) => {
    if (!produitVisible && !force) return null;
    if (i === script.scenes.length - 1 && partage) return partage.donnees;
    const liste = ecrans.length ? ecrans : capturesSite.map((v) => v.donnees);
    return liste.length ? liste[prochainEcran++ % liste.length] : null;
  };
  const produits = script.scenes.map((s, i) => (s.type_visuel === "produit" ? visuelProduit(i) : null));
  await journal("action", "🎨 Création des images des scènes par IA…");
  // Images créées en parallèle (la fonction doit finir en moins de 5 minutes).
  const creees = await Promise.all(
    script.scenes.map((s, i) =>
      produits[i]
        ? Promise.resolve(null)
        : genererImage(`${s.visuel}. ${univers} Vertical 9:16 composition, realistic photo, no text.`, "tiktok")
            .then((img) => Buffer.from(img.base64, "base64"))
            .catch(() => null),
    ),
  );
  const medias: { image?: Buffer; clip?: Buffer; cadre?: boolean }[] = script.scenes.map((_, i) => {
    const produit = produits[i];
    if (produit) return { image: produit, cadre: true };
    const image = creees[i];
    if (image) return { image };
    // Image IA impossible : une vue du produit à la place.
    const secours = visuelProduit(i, true);
    if (!secours) throw new Error("Images des scènes impossibles à créer.");
    return { image: secours, cadre: true };
  });
  const nbClips = medias.filter((m) => m.clip).length;
  await journal("info", `Scènes prêtes : ${medias.filter((m) => m.cadre).length} vue(s) du produit, ${nbClips} séquence(s) filmée(s), ${medias.length - nbClips - medias.filter((m) => m.cadre).length} image(s).`);

  // Vidéo animée : la page est déposée, le robot de rendu la filme (10 à 20
  // min). En cas de problème, montage classique tout de suite.
  if (animer) {
    try {
      await journal("action", "✨ Préparation de la vidéo animée (HyperFrames)…");
      const images: FichierAnime[] = medias.map((m, i) => {
        const ext = extensionImage(m.image);
        return { nom: `s${i}.${ext}`, donnees: m.image ?? Buffer.alloc(0), type: ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg" };
      });
      const audio: FichierAnime[] = [{ nom: "musique.m4a", donnees: Buffer.from(MUSIQUE_FOND_BASE64, "base64"), type: "audio/mp4" }];
      if (voix) audio.push({ nom: "voix.wav", donnees: voix.format === "pcm" ? wavDepuisPcm(voix.donnees) : voix.donnees, type: "audio/wav" });
      const plan: PlanAnime = {
        scenes: script.scenes.map((s, i) => ({ texte_ecran: s.texte_ecran, voix: s.voix, duree: d[i], image: images[i].nom, produit: Boolean(medias[i].cadre), repere: s.repere || undefined })),
        voix: voix ? "voix.wav" : null,
        musique: "musique.m4a",
        marque: contexte?.match(/Marque\s*:\s*(.+)/)?.[1]?.trim() || "",
        accent: accent ?? (site ? await couleurDuSite(site).catch(() => null) : null),
        fin: contexte?.match(/Appel à l'action\s*:\s*(.+)/)?.[1]?.trim().slice(0, 70) || null,
      };
      const fichiers = [...images, ...audio];
      const base = await animer(fichiers);
      await etat({
        brouillon: t.brouillon || script.legende,
        video_script: script,
        video_etat: "a_rendre",
        video_debut: new Date().toISOString(),
        // Le robot écrit la page animée à partir de ce plan (compositionAnimee).
        video_rendu: { base, fichiers: fichiers.map((f) => f.nom), plan },
        video_style: "anime",
        video_erreur: null,
      });
      await journal("info", "🎞️ Vidéo animée envoyée au studio de rendu : prête d'ici 10 à 20 minutes.");
      return "";
    } catch (err) {
      await journal("erreur", `Vidéo animée impossible (${err instanceof Error ? err.message.slice(0, 120) : "erreur"}) : montage classique à la place.`);
    }
  }

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

// Vidéo « Explication » : script en plans courts, voix off, captures de
// l'application ; la page est filmée par le robot de rendu (HyperFrames).
async function fabriquerExplication(
  t: SujetVideo,
  contexte: string | null,
  captures: Buffer[],
  accent: string | null,
  { journal, etat, animer }: Pick<AtelierVideo, "journal" | "etat"> & { animer: NonNullable<AtelierVideo["animer"]> },
) {
  if (!voixConfiguree()) throw new Error("voix off indisponible");
  await journal("action", `🎬 Écriture du script « Explication » (un plan toutes les 2 à 3 s) : « ${t.titre} »`);
  const script = lireExplication(
    await demanderIA(consigneExplication(t, contexte, captures.length, t.marche), {
      systeme: "Tu es scénariste de vidéos courtes pour les réseaux sociaux. Tu réponds uniquement en JSON valide.",
      maxTokens: 2500,
      delaiTotal: 90_000,
      gemini: "d'abord",
    }),
    captures.length,
    // Sources des chiffres permis : fiche de la marque et texte de la publication.
    [contexte, t.titre, t.consigne, t.brouillon].filter(Boolean).join("\n"),
  );
  if (!script) throw new Error("script illisible ou chiffres non vérifiés");
  const plans = [
    ...script.plans,
    { titre: ["UNE ASTUCE", "PAR JOUR"] as [string, string], phrase: phraseFinale(script.mot), visuel: { type: "appel" as const, mot: script.mot, detail: "on te répond avec le lien" } },
  ];
  await journal("info", `Script : ${plans.length} plans — « ${plans[0].titre.join(" ")} »`);
  await journal("action", "🎙️ Enregistrement de la voix off (Gemini)…");
  const voix = await voixOff(texteVoix(plans), tonVoix(t.marche, true, false));
  if (!voix) throw new Error("voix off impossible");
  const durees = dureesSurVoix(plans.map((p) => p.phrase), voix.duree);
  // Captures de l'application, dans l'ordre des plans qui en demandent une.
  const fichiers: FichierAnime[] = [
    { nom: "musique.m4a", donnees: Buffer.from(MUSIQUE_FOND_BASE64, "base64"), type: "audio/mp4" },
    { nom: "voix.wav", donnees: voix.format === "pcm" ? wavDepuisPcm(voix.donnees) : voix.donnees, type: "audio/wav" },
  ];
  let k = 0;
  const plansFinaux = plans.map((p, i) => {
    if (p.visuel.type !== "capture") return { ...p, duree: durees[i] };
    const image = captures[k];
    const ext = extensionImage(image);
    const nom = `capture${k++}.${ext}`;
    fichiers.push({ nom, donnees: image, type: ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg" });
    return { ...p, duree: durees[i], visuel: { ...p.visuel, image: nom } };
  });
  const plan: Explication & { kind: "explication" } = {
    kind: "explication",
    plans: plansFinaux,
    marque: contexte?.match(/Marque\s*:\s*(.+)/)?.[1]?.trim() || "",
    serie: "une astuce par jour",
    accent,
    voix: "voix.wav",
    musique: "musique.m4a",
  };
  const base = await animer(fichiers);
  // La légende de la publication rappelle le mot à commenter.
  const brouillon = t.brouillon || script.legende;
  await etat({
    brouillon: /commente/i.test(brouillon) ? brouillon : `${brouillon}\n\nCommente ${script.mot} 👇`,
    video_script: script,
    video_etat: "a_rendre",
    video_debut: new Date().toISOString(),
    video_rendu: { base, fichiers: fichiers.map((f) => f.nom), plan },
    video_style: "explication",
    video_erreur: null,
  });
  await journal("info", "🎞️ Vidéo « Explication » envoyée au studio de rendu : prête d'ici quelques minutes.");
  return true;
}
