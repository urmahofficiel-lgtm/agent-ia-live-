import { PLATEFORMES } from "./plateformes";
import { nettoyerPost } from "./texte";
import { clientMoteur } from "./supabase-serveur";
import { publierFacebook, publierInstagram, publierStoryInstagram } from "./meta.server";
import { prolongerJetonInstagram, publierInstagramDirect, publierStoryInstagramDirect } from "./instagram.server";
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

// Publie par le bon canal : connexion directe (Meta ou Instagram) si elle
// existe, sinon Zernio. Renvoie l'identifiant du post.
export async function publierSur(
  plateforme: string,
  userId: string,
  compte: CompteCible,
  texte: string,
  media: Media | null,
  image?: string | null,
  tacheId?: string,
) {
  // Dernier filet de sécurité : jamais de markdown affiché tel quel sur un réseau.
  texte = nettoyerPost(texte);
  if (tacheId) texte = await suivreLiens(texte, plateforme, userId, tacheId);
  if (compte.fournisseur === "bluesky" || compte.fournisseur === "telegram" || compte.fournisseur === "linkedin") {
    const { data, error } = await clientMoteur().rpc("compte_jeton", {
      p_secret: process.env.AGENT_TICK_SECRET ?? "",
      p_user: userId,
      p_externe: compte.compte_externe_id,
    });
    if (error || !data) throw new Error("Connexion introuvable : reconnectez le compte (page Comptes).");
    const identifiants = JSON.parse(data as string);
    // Bluesky et LinkedIn ne prennent pas la vidéo par cette voie : on y joint l'image.
    if (compte.fournisseur === "linkedin") return publierLinkedin(identifiants as IdentifiantsLinkedin, texte, media, image);
    return compte.fournisseur === "bluesky"
      ? publierBluesky(identifiants as IdentifiantsBluesky, texte, media, image)
      : publierTelegram(identifiants as IdentifiantsTelegram, texte, media);
  }
  if (compte.fournisseur === "meta" || compte.fournisseur === "instagram") {
    const secret = process.env.AGENT_TICK_SECRET ?? "";
    const sb = clientMoteur();
    const { data, error } = await sb.rpc("compte_jeton", { p_secret: secret, p_user: userId, p_externe: compte.compte_externe_id });
    if (error || !data) throw new Error("Connexion introuvable : reconnectez le compte (page Comptes).");
    let jeton = data as string;

    if (compte.fournisseur === "instagram") {
      const neuf = await prolongerJetonInstagram(jeton);
      if (neuf && neuf !== jeton) {
        jeton = neuf;
        await sb.rpc("compte_maj_jeton", { p_secret: secret, p_user: userId, p_externe: compte.compte_externe_id, p_jeton: neuf });
      }
      const post = await publierInstagramDirect(compte.compte_externe_id, jeton, texte, media);
      // La Story après le Reel : si elle échoue, le Reel reste publié.
      await publierStoryInstagramDirect(compte.compte_externe_id, jeton, media).catch((e) => console.warn("Story Instagram non publiée", e));
      return post.id;
    }
    const post =
      plateforme === "instagram"
        ? await publierInstagram(compte.compte_externe_id, jeton, texte, media)
        : await publierFacebook(compte.compte_externe_id, jeton, texte, media);
    if (plateforme === "instagram") await publierStoryInstagram(compte.compte_externe_id, jeton, media).catch((e) => console.warn("Story Instagram non publiée", e));
    return post.id;
  }
  const zernio = PLATEFORMES.find((p) => p.id === plateforme)?.zernio;
  if (!zernio) throw new Error("Cette plateforme ne peut pas encore publier.");
  const post = await publier(zernio, compte.compte_externe_id, texte, media, compte.cible_urn);
  return post._id;
}
