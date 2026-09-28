import { PLATEFORMES } from "./plateformes";
import { clientMoteur } from "./supabase-serveur";
import { publierFacebook, publierInstagram } from "./meta.server";
import { prolongerJetonInstagram, publierInstagramDirect } from "./instagram.server";
import { publierBluesky, type IdentifiantsBluesky } from "./bluesky.server";
import { publierTelegram, type IdentifiantsTelegram } from "./telegram.server";
import { publier, type Media } from "./zernio.server";

export type CompteCible = { fournisseur: string | null; compte_externe_id: string; cible_urn: string | null };

// Publie par le bon canal : connexion directe (Meta ou Instagram) si elle
// existe, sinon Zernio. Renvoie l'identifiant du post.
export async function publierSur(
  plateforme: string,
  userId: string,
  compte: CompteCible,
  texte: string,
  media: Media | null,
  image?: string | null,
) {
  if (compte.fournisseur === "bluesky" || compte.fournisseur === "telegram") {
    const { data, error } = await clientMoteur().rpc("compte_jeton", {
      p_secret: process.env.AGENT_TICK_SECRET ?? "",
      p_user: userId,
      p_externe: compte.compte_externe_id,
    });
    if (error || !data) throw new Error("Connexion introuvable : reconnectez le compte (page Comptes).");
    const identifiants = JSON.parse(data as string);
    // Bluesky ne prend pas la vidéo par cette voie : on y joint l'image.
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
      return (await publierInstagramDirect(compte.compte_externe_id, jeton, texte, media)).id;
    }
    const post =
      plateforme === "instagram"
        ? await publierInstagram(compte.compte_externe_id, jeton, texte, media)
        : await publierFacebook(compte.compte_externe_id, jeton, texte, media);
    return post.id;
  }
  const zernio = PLATEFORMES.find((p) => p.id === plateforme)?.zernio;
  if (!zernio) throw new Error("Cette plateforme ne peut pas encore publier.");
  const post = await publier(zernio, compte.compte_externe_id, texte, media, compte.cible_urn);
  return post._id;
}
