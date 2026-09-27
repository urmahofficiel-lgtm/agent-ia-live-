import { URL_SITE } from "./preparation.server";
import { lireJetonInstagram, urlDialogueInstagram, VERSION_GRAPH } from "./meta";
import { creerEtat, graph, publierInstagram } from "./meta.server";
import type { Media } from "./zernio.server";

// Connexion Instagram directe (« API Instagram avec connexion Instagram ») :
// un compte professionnel ou créateur, sans page Facebook à relier.
const GRAPH_IG = `https://graph.instagram.com/${VERSION_GRAPH}`;
export const RETOUR_INSTAGRAM = `${URL_SITE}/api/instagram/retour`;

export function instagramConfigure() {
  return Boolean(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET);
}

export function cleInstagram() {
  const appId = process.env.INSTAGRAM_APP_ID;
  const secret = process.env.INSTAGRAM_APP_SECRET;
  if (!appId || !secret) throw new Error("Clés INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET absentes des variables Vercel.");
  return { appId, secret };
}

export function urlConnexionInstagram(userId: string) {
  const { appId, secret } = cleInstagram();
  return urlDialogueInstagram({ appId, retour: RETOUR_INSTAGRAM, etat: creerEtat(userId, secret) });
}

// Code → jeton court → jeton 60 jours → profil.
export async function compteDepuisCodeInstagram(code: string) {
  const { appId, secret } = cleInstagram();
  const r = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    body: new URLSearchParams({ client_id: appId, client_secret: secret, grant_type: "authorization_code", redirect_uri: RETOUR_INSTAGRAM, code }),
  });
  const court = lireJetonInstagram(await r.json().catch(() => null));
  if (!r.ok || !court) throw new Error("Instagram : échange du code impossible. Recommencez la connexion.");
  const long = await graph<{ access_token: string }>(
    "/access_token",
    { grant_type: "ig_exchange_token", client_secret: secret, access_token: court.jeton },
    "GET",
    "https://graph.instagram.com",
  );
  const moi = await graph<{ user_id?: string; id?: string; username?: string }>(
    "/me",
    { fields: "user_id,username", access_token: long.access_token },
    "GET",
    GRAPH_IG,
  );
  return { externe_id: String(moi.user_id ?? moi.id ?? court.userId), nom: moi.username ?? "Instagram", jeton: long.access_token };
}

// Le jeton dure 60 jours ; on le prolonge à chaque publication (possible dès
// qu'il a plus de 24 h). En cas d'échec on garde l'ancien.
export async function prolongerJetonInstagram(jeton: string) {
  try {
    const r = await graph<{ access_token: string }>(
      "/refresh_access_token",
      { grant_type: "ig_refresh_token", access_token: jeton },
      "GET",
      "https://graph.instagram.com",
    );
    return r.access_token;
  } catch {
    return null;
  }
}

export function publierInstagramDirect(igUserId: string, jeton: string, texte: string, media: Media | null) {
  return publierInstagram(igUserId, jeton, texte, media, GRAPH_IG);
}
