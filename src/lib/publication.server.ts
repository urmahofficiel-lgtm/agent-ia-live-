import { PLATEFORMES } from "./plateformes";
import { clientMoteur } from "./supabase-serveur";
import { publierFacebook, publierInstagram } from "./meta.server";
import { publier, type Media } from "./zernio.server";

export type CompteCible = { fournisseur: string | null; compte_externe_id: string; cible_urn: string | null };

// Publie par le bon canal : connexion directe Meta si elle existe, sinon Zernio.
// Renvoie l'identifiant du post chez le réseau (ou chez Zernio).
export async function publierSur(plateforme: string, userId: string, compte: CompteCible, texte: string, media: Media | null) {
  if (compte.fournisseur === "meta") {
    const secret = process.env.AGENT_TICK_SECRET ?? "";
    const { data: jeton, error } = await clientMoteur().rpc("meta_jeton", {
      p_secret: secret,
      p_user: userId,
      p_externe: compte.compte_externe_id,
    });
    if (error || !jeton) throw new Error("Connexion Facebook introuvable : reconnectez le compte (page Comptes).");
    const post =
      plateforme === "instagram"
        ? await publierInstagram(compte.compte_externe_id, jeton as string, texte, media)
        : await publierFacebook(compte.compte_externe_id, jeton as string, texte, media);
    return post.id;
  }
  const zernio = PLATEFORMES.find((p) => p.id === plateforme)?.zernio;
  if (!zernio) throw new Error("Cette plateforme ne peut pas encore publier.");
  const post = await publier(zernio, compte.compte_externe_id, texte, media, compte.cible_urn);
  return post._id;
}
