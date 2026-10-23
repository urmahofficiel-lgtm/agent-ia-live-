import { PLATEFORMES } from "./plateformes";
import { nettoyerPost } from "./texte";
import { clientMoteur } from "./supabase-serveur";
import {
  commenterFacebook,
  commenterInstagram,
  publierCarrouselInstagram,
  publierFacebook,
  publierInstagram,
  publierStoryInstagram,
  type OptionsReel,
} from "./meta.server";
import {
  commenterInstagramDirect,
  prolongerJetonInstagram,
  publierCarrouselInstagramDirect,
  publierInstagramDirect,
  publierStoryInstagramDirect,
} from "./instagram.server";
import { publierBluesky, type IdentifiantsBluesky } from "./bluesky.server";
import { publierTelegram, type IdentifiantsTelegram } from "./telegram.server";
import { publierLinkedin, type IdentifiantsLinkedin } from "./linkedin.server";
import { publier, type Media } from "./zernio.server";
import { lienCliquable, remplacerLiens, trouverLiens } from "./liens-suivis";

export type CompteCible = { fournisseur: string | null; compte_externe_id: string; cible_urn: string | null };

// Remplace les liens du post par des liens courts qui comptent les clics. En
// cas de souci, le post part avec ses liens d'origine.
async function suivreLiens(texte: string, plateforme: string, userId: string, tacheId: string) {
  if (!lienCliquable(plateforme)) return texte;
  const liens = trouverLiens(texte).slice(0, 5);
  if (!liens.length) return texte;
  try {
    const codes = new Map<string, string>();
    for (const url of liens) {
      const { data, error } = await clientMoteur().rpc("lien_suivi_creer", {
        p_secret: process.env.AGENT_TICK_SECRET ?? "",
        p_user: userId,
        p_tache: tacheId,
        p_url: url,
      });
      if (error || typeof data !== "string") throw new Error(error?.message ?? "code absent");
      codes.set(url, data);
    }
    return remplacerLiens(texte, codes);
  } catch (e) {
    console.warn("Liens suivis indisponibles", e instanceof Error ? e.message : e);
    return texte;
  }
}

// Ce qui accompagne le post (mode croissance) : diapositives d'un carrousel,
// document PDF (LinkedIn), Trial Reel et couverture (Instagram), premier
// commentaire.
export type ExtrasPublication = {
  images?: string[];
  document?: { url: string; titre: string } | null;
  reel?: OptionsReel;
  premierCommentaire?: string | null;
};

const avertir = (quoi: string) => (e: unknown) => console.warn(quoi, e instanceof Error ? e.message : e);

// Format riche (carrousel, document) refusé par le réseau : le post part
// quand même, au format simple, plutôt que d'échouer.
async function enSecours<T>(essai: () => Promise<T>, secours: (() => Promise<T>) | null, quoi: string): Promise<T> {
  try {
    return await essai();
  } catch (e) {
    if (!secours) throw e;
    avertir(quoi)(e);
    return secours();
  }
}

// Publie par le bon canal : connexion directe (Meta ou Instagram) si elle
// existe, sinon Zernio. Renvoie l'identifiant du post et la « suite » (Story,
// premier commentaire) : le moteur enregistre le post comme publié AVANT la
// suite, pour qu'un passage coupé en route ne le republie jamais.
export async function publierAvecSuite(
  plateforme: string,
  userId: string,
  compte: CompteCible,
  texte: string,
  media: Media | null,
  image?: string | null,
  tacheId?: string,
  extras: ExtrasPublication = {},
): Promise<{ id: string; suite: () => Promise<void> }> {
  const rien = async () => {};
  // Dernier filet de sécurité : jamais de markdown affiché tel quel sur un réseau.
  texte = nettoyerPost(texte);
  if (tacheId) texte = await suivreLiens(texte, plateforme, userId, tacheId);
  const images = extras.images ?? [];
  const commentaire = extras.premierCommentaire?.trim() || null;
  if (compte.fournisseur === "bluesky" || compte.fournisseur === "telegram" || compte.fournisseur === "linkedin") {
    const { data, error } = await clientMoteur().rpc("compte_jeton", {
      p_secret: process.env.AGENT_TICK_SECRET ?? "",
      p_user: userId,
      p_externe: compte.compte_externe_id,
    });
    if (error || !data) throw new Error("Connexion introuvable : reconnectez le compte (page Comptes).");
    const identifiants = JSON.parse(data as string);
    // Bluesky et LinkedIn ne prennent pas la vidéo par cette voie : on y joint l'image.
    const id =
      compte.fournisseur === "linkedin"
        ? await publierLinkedin(identifiants as IdentifiantsLinkedin, texte, media, image)
        : compte.fournisseur === "bluesky"
          ? await publierBluesky(identifiants as IdentifiantsBluesky, texte, media, image)
          : await publierTelegram(identifiants as IdentifiantsTelegram, texte, media);
    return { id, suite: rien };
  }
  if (compte.fournisseur === "meta" || compte.fournisseur === "instagram") {
    const secret = process.env.AGENT_TICK_SECRET ?? "";
    const sb = clientMoteur();
    const { data, error } = await sb.rpc("compte_jeton", { p_secret: secret, p_user: userId, p_externe: compte.compte_externe_id });
    if (error || !data) throw new Error("Connexion introuvable : reconnectez le compte (page Comptes).");
    let jeton = data as string;
    const carrousel = images.length >= 2;

    if (compte.fournisseur === "instagram") {
      const neuf = await prolongerJetonInstagram(jeton);
      if (neuf && neuf !== jeton) {
        jeton = neuf;
        await sb.rpc("compte_maj_jeton", { p_secret: secret, p_user: userId, p_externe: compte.compte_externe_id, p_jeton: neuf });
      }
      const post = carrousel
        ? await enSecours(
            () => publierCarrouselInstagramDirect(compte.compte_externe_id, jeton, texte, images),
            () => publierInstagramDirect(compte.compte_externe_id, jeton, texte, media),
            "Carrousel Instagram refusé, publié en image",
          )
        : await publierInstagramDirect(compte.compte_externe_id, jeton, texte, media, extras.reel);
      return {
        id: post.id,
        suite: async () => {
          if (commentaire) await commenterInstagramDirect(post.id, jeton, commentaire).catch(avertir("Premier commentaire Instagram non publié"));
          // La Story après le Reel (pas pour un Trial Reel, réservé d'abord
          // aux non-abonnés) : si elle échoue, le Reel reste publié.
          if (!carrousel && !extras.reel?.essai) await publierStoryInstagramDirect(compte.compte_externe_id, jeton, media).catch(avertir("Story Instagram non publiée"));
        },
      };
    }
    if (plateforme === "instagram") {
      const post = carrousel
        ? await enSecours(
            () => publierCarrouselInstagram(compte.compte_externe_id, jeton, texte, images),
            () => publierInstagram(compte.compte_externe_id, jeton, texte, media),
            "Carrousel Instagram refusé, publié en image",
          )
        : await publierInstagram(compte.compte_externe_id, jeton, texte, media, undefined, false, extras.reel);
      return {
        id: post.id,
        suite: async () => {
          if (commentaire) await commenterInstagram(post.id, jeton, commentaire).catch(avertir("Premier commentaire Instagram non publié"));
          if (!carrousel && !extras.reel?.essai) await publierStoryInstagram(compte.compte_externe_id, jeton, media).catch(avertir("Story Instagram non publiée"));
        },
      };
    }
    const post = carrousel
      ? await enSecours(
          () => publierFacebook(compte.compte_externe_id, jeton, texte, media, images),
          () => publierFacebook(compte.compte_externe_id, jeton, texte, media),
          "Photos multiples refusées par Facebook, publié en image",
        )
      : await publierFacebook(compte.compte_externe_id, jeton, texte, media);
    return {
      id: post.id,
      suite: async () => {
        if (commentaire) await commenterFacebook(post.id, jeton, commentaire).catch(avertir("Premier commentaire Facebook non publié"));
      },
    };
  }
  const zernio = PLATEFORMES.find((p) => p.id === plateforme)?.zernio;
  if (!zernio) throw new Error("Cette plateforme ne peut pas encore publier.");
  // Zernio publie lui-même le premier commentaire (LinkedIn, Facebook…).
  const avecFormat = images.length >= 2 || Boolean(extras.document);
  const post = await enSecours(
    () => publier(zernio, compte.compte_externe_id, texte, media, compte.cible_urn, { images, document: extras.document ?? null, premierCommentaire: commentaire }),
    // Carrousel ou document refusé : le post part avec sa couverture en image.
    avecFormat ? () => publier(zernio, compte.compte_externe_id, texte, media, compte.cible_urn, { premierCommentaire: commentaire }) : null,
    `Carrousel ou document refusé sur ${plateforme}, publié en image`,
  );
  return { id: post._id, suite: rien };
}

// Publication complète (post puis sa suite), pour les envois depuis l'appli.
export async function publierSur(
  plateforme: string,
  userId: string,
  compte: CompteCible,
  texte: string,
  media: Media | null,
  image?: string | null,
  tacheId?: string,
) {
  const { id, suite } = await publierAvecSuite(plateforme, userId, compte, texte, media, image, tacheId);
  await suite();
  return id;
}
