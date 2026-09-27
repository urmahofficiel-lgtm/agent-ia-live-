import { createHmac, timingSafeEqual } from "node:crypto";
import { URL_SITE } from "./preparation.server";
import { VERSION_GRAPH, comptesDepuisPages, urlDialogue, type PageMeta } from "./meta";
import type { Media } from "./zernio.server";

const GRAPH = `https://graph.facebook.com/${VERSION_GRAPH}`;
export const RETOUR_META = `${URL_SITE}/api/meta/retour`;

export function metaConfigure() {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

function cles() {
  const appId = process.env.META_APP_ID;
  const secret = process.env.META_APP_SECRET;
  if (!appId || !secret) throw new Error("Clés META_APP_ID / META_APP_SECRET absentes des variables Vercel.");
  return { appId, secret };
}

// --- État signé : relie le retour de Facebook à l'utilisateur qui a cliqué ---

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const signer = (donnees: string, secret: string) => createHmac("sha256", secret).update(donnees).digest("base64url");

export function creerEtat(userId: string, secret = cles().secret, maintenant = Date.now()) {
  const donnees = b64(JSON.stringify({ u: userId, exp: maintenant + 15 * 60_000 }));
  return `${donnees}.${signer(donnees, secret)}`;
}

export function lireEtat(etat: string, secret = cles().secret, maintenant = Date.now()): string | null {
  const [donnees, signature] = etat.split(".");
  if (!donnees || !signature) return null;
  const attendu = Buffer.from(signer(donnees, secret));
  const recu = Buffer.from(signature);
  if (attendu.length !== recu.length || !timingSafeEqual(attendu, recu)) return null;
  try {
    const { u, exp } = JSON.parse(Buffer.from(donnees, "base64url").toString()) as { u: string; exp: number };
    return exp > maintenant && typeof u === "string" ? u : null;
  } catch {
    return null;
  }
}

export function urlConnexionMeta(userId: string) {
  const { appId } = cles();
  // Connexion classique par liste de droits : la configuration « Business »
  // (META_CONFIG_ID) fait échouer la page de Facebook pour cette app.
  return urlDialogue({ appId, retour: RETOUR_META, etat: creerEtat(userId) });
}

// --- Appels à l'API Graph --------------------------------------------------

export async function graph<T>(
  chemin: string,
  params: Record<string, string>,
  methode: "GET" | "POST" = "GET",
  base = GRAPH,
): Promise<T> {
  const q = new URLSearchParams(params);
  const r =
    methode === "GET"
      ? await fetch(`${base}${chemin}?${q}`)
      : await fetch(`${base}${chemin}`, { method: "POST", body: q, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  const json = (await r.json().catch(() => ({}))) as { error?: { message?: string; error_user_msg?: string } };
  if (!r.ok || json.error) throw new Error(`Meta : ${json.error?.error_user_msg || json.error?.message || `erreur ${r.status}`}`);
  return json as T;
}

// Code reçu au retour → jeton longue durée → pages (et Instagram reliés).
export async function comptesDepuisCode(code: string) {
  const { appId, secret } = cles();
  const court = await graph<{ access_token: string }>("/oauth/access_token", {
    client_id: appId,
    client_secret: secret,
    redirect_uri: RETOUR_META,
    code,
  });
  const long = await graph<{ access_token: string }>("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: secret,
    fb_exchange_token: court.access_token,
  });
  // Jetons de page issus d'un jeton longue durée : ils n'expirent pas.
  const pages = await graph<{ data: PageMeta[] }>("/me/accounts", {
    access_token: long.access_token,
    fields: "id,name,access_token,instagram_business_account{id,username}",
    limit: "100",
  });
  return comptesDepuisPages(pages.data ?? []);
}

export async function publierFacebook(pageId: string, jeton: string, texte: string, media: Media | null) {
  if (media?.type === "video") {
    return graph<{ id: string }>(`/${pageId}/videos`, { access_token: jeton, file_url: media.url, description: texte }, "POST");
  }
  if (media?.type === "image") {
    return graph<{ id: string }>(`/${pageId}/photos`, { access_token: jeton, url: media.url, caption: texte }, "POST");
  }
  return graph<{ id: string }>(`/${pageId}/feed`, { access_token: jeton, message: texte }, "POST");
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Instagram : on crée un « conteneur », on attend que Meta ait récupéré le
// média, puis on le publie.
// `base` : graph.facebook.com (compte relié à une page) ou graph.instagram.com
// (connexion Instagram directe) ; les appels sont identiques.
export async function publierInstagram(igId: string, jeton: string, texte: string, media: Media | null, base = GRAPH) {
  if (!media) throw new Error("Instagram exige une image ou une vidéo : créez d'abord le visuel.");
  const conteneur = await graph<{ id: string }>(
    `/${igId}/media`,
    media.type === "video"
      ? { access_token: jeton, media_type: "REELS", video_url: media.url, caption: texte }
      : { access_token: jeton, image_url: media.url, caption: texte },
    "POST",
    base,
  );
  const limite = Date.now() + (media.type === "video" ? 180_000 : 60_000);
  for (;;) {
    const { status_code } = await graph<{ status_code?: string }>(`/${conteneur.id}`, { access_token: jeton, fields: "status_code" }, "GET", base);
    if (status_code === "FINISHED" || !status_code) break;
    if (status_code === "ERROR" || status_code === "EXPIRED") throw new Error("Meta : Instagram a refusé le média (format ou taille).");
    if (Date.now() > limite) throw new Error("Meta : Instagram met trop de temps à traiter le média. Réessayez.");
    await pause(4000);
  }
  return graph<{ id: string }>(`/${igId}/media_publish`, { access_token: jeton, creation_id: conteneur.id }, "POST", base);
}
