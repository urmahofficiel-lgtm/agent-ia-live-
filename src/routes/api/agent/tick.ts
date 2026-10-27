import { avecVeille } from "@/lib/veille";
import { createFileRoute } from "@tanstack/react-router";
import { PLATEFORMES, estManuel } from "@/lib/plateformes";
import { publierAvecSuite } from "@/lib/publication.server";
import { fabriquerCarrousel } from "@/lib/carrousel.server";
import { estCroissance, extrairePremierCommentaire } from "@/lib/croissance";
import { preparer, type Ecrivain } from "@/lib/preparation.server";
import type { PhotoStockee } from "@/lib/phototheque";
import { fabriquerVideo } from "@/lib/fabrication-video.server";
import { clientMoteur } from "@/lib/supabase-serveur";
import { lireStyleImage, lireStyleVideo, styleVideoPour } from "@/lib/styles";
import { planifierJournees } from "@/lib/pilote.server";
import { estEtranger, marcheDe } from "@/lib/marches";
import { controlerPublication, type DejaPubliee } from "@/lib/controle-qualite";
import { nettoyerHashtags } from "@/lib/tendances";

// Moteur de l'agent : appelé toutes les 5 minutes par pg_cron (Supabase).
// 1. Publie les tâches validées dont l'heure est venue (texte + visuel).
// 2. Pilote automatique : planifie les publications du jour (une fois par jour).
// 3. Prépare les brouillons manquants (texte + visuel) pour validation.
// 4. Crée les vidéos (Reels Facebook / Instagram, vidéos TikTok).
// Chaque étape est racontée dans le journal « en direct ».
type Due = {
  tache_id: string;
  user_id: string;
  plateforme: string | null;
  titre: string;
  consigne: string;
  brouillon: string | null;
  visuel_url: string | null;
  video_url: string | null;
  compte_externe_id: string | null;
  cible_urn: string | null;
  fournisseur: string | null;
  contexte: string | null;
  // Langue et pays du compte visé (« it-IT »…) : texte, visuel et vidéo dans sa langue.
  marche: string;
  // Résultat complet (carrousel, Trial Reel…) ; absent avec l'ancienne file.
  resultat?: Record<string, unknown> | null;
};

type ACarrousel = { tache_id: string; user_id: string; plateforme: string; titre: string; consigne: string; brouillon: string; contexte: string | null; essais: number; marche: string };

// Carrousel prêt enregistré avec la tâche (diapositives déposées).
function lireCarrouselPret(resultat: Record<string, unknown> | null | undefined) {
  const c = resultat?.carrousel as { images?: unknown; pdf_url?: unknown; titre?: unknown } | null | undefined;
  const images = Array.isArray(c?.images) ? c.images.filter((x): x is string => typeof x === "string") : [];
  if (images.length < 2) return null;
  return { images, pdf_url: typeof c?.pdf_url === "string" ? c.pdf_url : null, titre: typeof c?.titre === "string" ? c.titre : "Carrousel" };
}

type AFilmer = { tache_id: string; user_id: string; plateforme: string; titre: string; consigne: string; brouillon: string; contexte: string | null; site: string | null; essais: number; marche: string };

type ARediger = { tache_id: string; type: string; plateforme: string | null; titre: string; consigne: string; contexte: string | null; brouillon: string | null; marche: string };

async function tick(secret: string) {
  const debut = Date.now();
  const sb = clientMoteur();

  const maj = (id: string, statut: string | null, resultat: object | null, niveau: string, msg: string | null) =>
    sb.rpc("agent_maj_tache", { p_secret: secret, p_tache_id: id, p_statut: statut, p_resultat: resultat, p_niveau: niveau, p_message: msg });

  const ecrivainMoteur = (tacheId: string): Ecrivain => ({
    journal: (niveau, msg, image) => maj(tacheId, null, image ? { visuel_url: image } : null, niveau, msg),
    enregistrer: (partiel) => maj(tacheId, null, partiel, "info", null),
    ajouterVisuel: async (mime, donnees, prompt) => {
      const { data, error } = await sb.rpc("agent_ajouter_visuel", {
        p_secret: secret,
        p_tache_id: tacheId,
        p_mime: mime,
        p_donnees: donnees,
        p_prompt: prompt,
      });
      if (error || !data) throw new Error(error?.message ?? "Enregistrement de l'image impossible.");
      return data as string;
    },
    // Fonctions absentes tant que la migration n'est pas appliquée : liste vide.
    phototheque: async () => {
      const { data, error } = await sb.rpc("agent_phototheque", { p_secret: secret, p_tache_id: tacheId });
      return error ? [] : ((data ?? []) as PhotoStockee[]);
    },
    photoUtilisee: (id) => sb.rpc("agent_phototheque_utilisee", { p_secret: secret, p_photo_id: id }),
  });

  // Styles par défaut du propriétaire de la tâche (Réglages). Fonction
  // absente tant que la migration n'est pas appliquée : classique / photo.
  const styles = async (tacheId: string) => {
    const { data, error } = await sb.rpc("agent_styles_defaut", { p_secret: secret, p_tache_id: tacheId });
    const s = (error ? null : data) as { video?: string; image?: string } | null;
    return { video: lireStyleVideo(s?.video), image: lireStyleImage(s?.image) };
  };
  const styleImage = async (tacheId: string, visuel: string | null) => (visuel ? undefined : (await styles(tacheId)).image);

  // 0. Publications restées en attente 12 h après leur heure : en échec.
  await sb.rpc("agent_echouer_perimees", { p_secret: secret });
  // Publications restées « en cours » (passage coupé en route : délai Vercel
  // dépassé, IA bloquée) : remises en file une fois, puis en échec.
  await sb.rpc("agent_reprendre_bloquees", { p_secret: secret });

  // Sujets publiés ces derniers jours, par utilisateur (contrôle des doublons).
  const recentes = new Map<string, DejaPubliee[]>();
  const publieesRecemment = async (userId: string) => {
    if (!recentes.has(userId)) {
      const { data: r } = await sb.rpc("agent_publications_recentes", { p_secret: secret, p_user: userId });
      recentes.set(userId, (r ?? []) as DejaPubliee[]);
    }
    return recentes.get(userId)!;
  };

  // 1. Publications à l'heure, réservées dès qu'elles sont prises (ancienne
  // file si la migration n'est pas encore appliquée).
  let { data, error } = await sb.rpc("agent_publications_a_envoyer", { p_secret: secret });
  if (error) ({ data, error } = await sb.rpc("agent_publications_dues", { p_secret: secret }));
  if (error) throw new Error(error.message);
  const dues = (data ?? []) as Due[];
  // Déjà mises de côté par le contrôle qualité puis revalidées : relues, elles partent.
  const { data: vus } = dues.length ? await sb.rpc("agent_controles_vus", { p_secret: secret, p_ids: dues.map((t) => t.tache_id) }) : { data: [] };
  const relues = new Set((vus ?? []) as string[]);
  let traitees = 0;
  for (const t of dues) {
    // Profil Facebook perso : on prépare tout, l'utilisateur partage en 1 clic.
    if (estManuel(t.plateforme)) {
      try {
        await preparer(
          {
            type: "publication",
            plateforme: t.plateforme,
            titre: t.titre,
            consigne: t.consigne,
            marche: t.marche,
            brouillon: t.brouillon,
            visuel_url: t.visuel_url,
            style_visuel: await styleImage(t.tache_id, t.visuel_url),
          },
          avecVeille(t.contexte),
          ecrivainMoteur(t.tache_id),
        );
        await maj(t.tache_id, "a_partager", null, "action", `📲 « ${t.titre} » est prêt : partagez-le en 1 clic depuis Publications → À partager.`);
        traitees++;
      } catch (e) {
        await maj(t.tache_id, "echouee", null, "erreur", `Préparation impossible pour « ${t.titre} » : ${e instanceof Error ? e.message : "erreur"}`);
      }
      continue;
    }
    if (!t.plateforme || !t.compte_externe_id) {
      const manque = estEtranger(t.marche) ? `aucun compte ${PLATEFORMES.find((p) => p.id === t.plateforme)?.nom ?? ""} ${marcheDe(t.marche).drapeau} connecté` : "réseau non connecté";
      await maj(t.tache_id, "echouee", null, "erreur", `« ${t.titre} » : ${manque}, publication impossible.`);
      continue;
    }
    try {
      await maj(t.tache_id, "en_cours", null, "action", `🤖 L'agent prend en charge « ${t.titre} »`);
      const pret = await preparer(
        {
          type: "publication",
          plateforme: t.plateforme,
          titre: t.titre,
          consigne: t.consigne,
          marche: t.marche,
          brouillon: t.brouillon,
          visuel_url: t.visuel_url,
          // Vidéo déjà prête : elle est publiée à la place de l'image.
          style_visuel: t.video_url ? undefined : await styleImage(t.tache_id, t.visuel_url),
        },
        avecVeille(t.contexte),
        ecrivainMoteur(t.tache_id),
      );
      // Mode croissance : le « Premier commentaire : … » écrit à la fin du
      // post part en commentaire, pas dans le texte.
      const croissance = estCroissance(t.consigne);
      const { texte: sansCommentaire, commentaire } = extrairePremierCommentaire(pret.brouillon ?? "");
      if (pret.brouillon) pret.brouillon = sansCommentaire;
      // Hashtags : inventés retirés, nombre limité selon le réseau (y compris
      // pour les brouillons écrits avant cette règle).
      if (pret.brouillon) pret.brouillon = nettoyerHashtags(pret.brouillon, t.plateforme);
      // Contrôle qualité : langue, texte, doublon. En cas de doute, la
      // publication attend une relecture au lieu de partir.
      const raisons = relues.has(t.tache_id) ? [] : controlerPublication({ plateforme: t.plateforme, titre: t.titre, marche: t.marche, texte: pret.brouillon, croissance }, await publieesRecemment(t.user_id));
      if (raisons.length) {
        await maj(t.tache_id, "a_valider", { controle_raisons: raisons }, "erreur", `🛑 « ${t.titre} » mise de côté par le contrôle qualité (${raisons.join(" ; ")}). À relire dans Publications → À valider.`);
        continue;
      }
      const carrousel = lireCarrouselPret(t.resultat);
      // TikTok : la publication a attendu sa vidéo (45 min au plus) ; sans
      // elle, on publie ce qu'on a et on le dit.
      if (t.plateforme === "tiktok" && !t.video_url && !carrousel) {
        await maj(t.tache_id, null, null, "info", `⏱️ Vidéo TikTok pas prête à temps pour « ${t.titre} » : publication ${pret.visuel_url ? "avec l'image" : "sans visuel"}.`);
      }
      await maj(t.tache_id, null, null, "action", `🚀 Publication sur ${PLATEFORMES.find((p) => p.id === t.plateforme)?.nom}${carrousel ? ` (carrousel de ${carrousel.images.length} diapositives)` : ""}…`);
      const media = carrousel
        ? ({ type: "image", url: carrousel.images[0] } as const)
        : t.video_url
          ? ({ type: "video", url: t.video_url } as const)
          : pret.visuel_url
            ? ({ type: "image", url: pret.visuel_url } as const)
            : null;
      const { id: postId, suite } = await publierAvecSuite(
        t.plateforme,
        t.user_id,
        { fournisseur: t.fournisseur, compte_externe_id: t.compte_externe_id, cible_urn: t.cible_urn },
        pret.brouillon,
        media,
        pret.visuel_url,
        t.tache_id,
        {
          images: carrousel?.images,
          document: carrousel?.pdf_url ? { url: carrousel.pdf_url, titre: carrousel.titre } : null,
          // Reel : couverture prise sur l'accroche, audio nommé d'après le
          // sujet ; Trial Reel si le pilier s'y prête.
          reel: croissance && t.video_url ? { essai: t.resultat?.essai_reel === true, couvertureMs: 600, nomAudio: t.titre } : undefined,
          premierCommentaire: commentaire,
        },
      );
      // Enregistré comme publié AVANT la suite (Story, premier commentaire) :
      // un passage coupé en route ne republiera jamais ce post.
      await maj(
        t.tache_id,
        "terminee",
        { post_id: postId, publie_le: new Date().toISOString(), ...(commentaire ? { premier_commentaire: commentaire } : {}) },
        "info",
        `✅ Publié : « ${t.titre} »${t.resultat?.essai_reel === true && t.video_url && t.plateforme === "instagram" ? " (Trial Reel : montré d'abord aux non-abonnés)" : ""}`,
      );
      await suite().catch((e) => console.warn("Suite de la publication", e instanceof Error ? e.message : e));
      traitees++;
    } catch (e) {
      await maj(t.tache_id, "echouee", null, "erreur", `Échec sur « ${t.titre} » : ${e instanceof Error ? e.message : "erreur"}`);
    }
  }

  // 2. Pilote automatique : publications du jour choisies par l'IA (léger :
  // sauté si le passage a déjà pris du temps, repris au suivant).
  if (Date.now() - debut < 120_000) {
    try {
      const n = await planifierJournees(sb, secret, debut + 200_000);
      if (n) console.info(`Pilote automatique : ${n} publication(s) planifiée(s).`);
    } catch (e) {
      console.warn("Pilote automatique", e instanceof Error ? e.message : e);
    }
  }

  // 2 bis. Carrousels (mode croissance) : diapositives écrites à partir du
  // texte, dessinées, déposées (une par passage).
  if (Date.now() - debut < 90_000) {
    const { data: aDessiner } = await sb.rpc("agent_carrousels_a_faire", { p_secret: secret });
    for (const c of (aDessiner ?? []) as ACarrousel[]) {
      try {
        await maj(c.tache_id, null, { essais_carrousel: c.essais + 1 }, "info", null);
        await fabriquerCarrousel({ id: c.tache_id, plateforme: c.plateforme, titre: c.titre, consigne: c.consigne, brouillon: c.brouillon, marche: c.marche }, avecVeille(c.contexte), {
          journal: (niveau, msg) => maj(c.tache_id, null, null, niveau, msg),
          etat: (champs) => maj(c.tache_id, null, champs, "info", null),
          deposer: async (fichier, type, nom) => {
            // Même ticket de dépôt que les vidéos : pas d'accès libre au stockage.
            const { data: ticket, error } = await sb.rpc("agent_depot_video", { p_secret: secret, p_user: c.user_id });
            if (error || !ticket) throw new Error("Dépôt du carrousel refusé.");
            const seau = type === "application/pdf" ? "documents" : "studio";
            const chemin = `${c.user_id}/auto-${ticket as string}/${nom}`;
            const { error: errDepot } = await sb.storage.from(seau).upload(chemin, fichier, { contentType: type });
            if (errDepot) throw new Error(`Enregistrement du carrousel impossible : ${errDepot.message}`);
            return sb.storage.from(seau).getPublicUrl(chemin).data.publicUrl;
          },
        });
        traitees++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "erreur";
        // Deuxième échec : la publication repart sur son format habituel
        // (vidéo ou image) plutôt que de rester bloquée.
        const abandon = c.essais + 1 >= 2;
        await maj(
          c.tache_id,
          null,
          abandon ? { carrousel_etat: "echec", format: null, video_etat: null } : { carrousel_etat: null },
          "erreur",
          `Carrousel non créé pour « ${c.titre} » : ${msg}${abandon ? " — publication au format habituel." : " — nouvel essai au prochain passage."}`,
        );
      }
    }
  }

  // 3. Brouillons à préparer (tâches créées par une commande ou la stratégie).
  const { data: aRediger } = await sb.rpc("agent_redactions_a_faire", { p_secret: secret });
  for (const t of (aRediger ?? []) as ARediger[]) {
    // IA lente : la seconde rédaction attend le passage suivant plutôt que de
    // faire dépasser la limite des 5 minutes.
    if (Date.now() - debut > 150_000) break;
    try {
      const style_visuel = t.type === "publication" ? await styleImage(t.tache_id, null) : undefined;
      await preparer({ type: t.type, plateforme: t.plateforme, titre: t.titre, consigne: t.consigne, marche: t.marche, brouillon: t.brouillon, style_visuel }, avecVeille(t.contexte), ecrivainMoteur(t.tache_id));
      await maj(t.tache_id, null, null, "info", `Prêt à valider : « ${t.titre} »`);
    } catch (e) {
      const message = `Rédaction impossible pour « ${t.titre} » : ${e instanceof Error ? e.message : "erreur"}`;
      // Un essai de plus (3 au plus) ; ancienne règle si la migration manque.
      const { error } = await sb.rpc("agent_echec_redaction", { p_secret: secret, p_tache_id: t.tache_id, p_message: message });
      if (error) await maj(t.tache_id, null, { essais_brouillon: 3 }, "erreur", message);
    }
  }

  // 4. Vidéos automatiques : les publications Facebook, Instagram et TikTok
  // reçoivent leur vidéo verticale (2 à 3 min de fabrication), une par passage, s'il
  // reste assez de temps avant la limite de 5 minutes.
  if (Date.now() - debut < 60_000) {
    const { data: aFilmer } = await sb.rpc("agent_videos_a_tourner", { p_secret: secret });
    for (const v of (aFilmer ?? []) as AFilmer[]) {
      const etat = (champs: Record<string, unknown>) => maj(v.tache_id, null, champs, "info", null);
      try {
        const tiktok = v.plateforme === "tiktok";
        await maj(v.tache_id, null, { essais_video: v.essais + 1 }, "action", `🎬 Création automatique ${tiktok ? "de la vidéo TikTok" : "du Reel"} pour « ${v.titre} »`);
        // TikTok : style « face caméra » plutôt que classique.
        const style = styleVideoPour(v.plateforme, (await styles(v.tache_id)).video, v.tache_id);
        await fabriquerVideo({ id: v.tache_id, plateforme: v.plateforme, titre: v.titre, consigne: v.consigne, brouillon: v.brouillon, marche: v.marche }, avecVeille(v.contexte), v.site, {
          journal: (niveau, msg) => maj(v.tache_id, null, null, niveau, msg),
          etat,
          deposer: async (mp4) => {
            // Ticket de dépôt à usage unique : le moteur n'a pas d'accès libre au stockage.
            const { data: ticket, error } = await sb.rpc("agent_depot_video", { p_secret: secret, p_user: v.user_id });
            if (error || !ticket) throw new Error("Dépôt de la vidéo refusé.");
            const chemin = `${v.user_id}/auto-${ticket as string}/${v.tache_id}-${Date.now()}.mp4`;
            const { error: errDepot } = await sb.storage.from("videos").upload(chemin, mp4, { contentType: "video/mp4" });
            if (errDepot) throw new Error(`Enregistrement de la vidéo impossible : ${errDepot.message}`);
            return sb.storage.from("videos").getPublicUrl(chemin).data.publicUrl;
          },
          // Captures de l'application déposées par l'utilisateur (page Stratégie).
          captures: async () => {
            const { data } = await sb.rpc("agent_captures_appli", { p_secret: secret, p_user: v.user_id });
            return ((data ?? []) as string[]).map((nom) => sb.storage.from("captures").getPublicUrl(nom).data.publicUrl);
          },
        }, style);
        traitees++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "erreur";
        await maj(v.tache_id, null, { video_etat: "echec", video_erreur: msg }, "erreur", `${v.plateforme === "tiktok" ? "Vidéo TikTok" : "Reel"} non créé${v.plateforme === "tiktok" ? "e" : ""} pour « ${v.titre} » : ${msg}`);
      }
    }
  }

  return traitees;
}

export const Route = createFileRoute("/api/agent/tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-agent-secret") ?? "";
        const attendu = process.env.AGENT_TICK_SECRET ?? "";
        if (!attendu || secret !== attendu) return new Response("Non autorisé", { status: 401 });
        try {
          const traitees = await tick(secret);
          return Response.json({ ok: true, traitees });
        } catch (e) {
          console.error("tick", e);
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
