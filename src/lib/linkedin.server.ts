import { URL_SITE } from "./preparation.server";
import { texteLinkedin, urlDialogueLinkedin } from "./linkedin";
import { creerEtat } from "./meta.server";
import type { Media } from "./zernio.server";

export const RETOUR_LINKEDIN = `${URL_SITE}/api/linkedin/retour`;
// Version de l'API « Posts » (format AAAAMM) ; modifiable sans redéployer le code.
const VERSION = () => process.env.LINKEDIN_VERSION || "202608";

export type IdentifiantsLinkedin = { acces: string; auteur: string; expire: number };

export function linkedinConfigure() {
  return Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);
}

export function cleLinkedin() {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const secret = process.env.LINKEDIN_CLIENT_SECRET;
  if (!clientId || !secret) throw new Error("Clés LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET absentes des variables Vercel.");
  return { clientId, secret };
}

export function urlConnexionLinkedin(userId: string) {
  const { clientId, secret } = cleLinkedin();
  return urlDialogueLinkedin({ clientId, retour: RETOUR_LINKEDIN, etat: creerEtat(userId, secret) });
}

// Code → jeton (60 jours) → identité du membre.
export async function compteDepuisCodeLinkedin(code: string) {
  const { clientId, secret } = cleLinkedin();
  const r = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: RETOUR_LINKEDIN, client_id: clientId, client_secret: secret }),
  });
  const jeton = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!r.ok || !jeton.access_token) throw new Error(`LinkedIn : ${jeton.error_description ?? "connexion refusée"}.`);
  const moi = (await (
    await fetch("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${jeton.access_token}` } })
  ).json()) as { sub?: string; name?: string };
  if (!moi.sub) throw new Error("LinkedIn : profil illisible.");
  const identifiants: IdentifiantsLinkedin = {
    acces: jeton.access_token,
    auteur: `urn:li:person:${moi.sub}`,
    expire: Date.now() + (jeton.expires_in ?? 5_184_000) * 1000,
  };
  return { externe: moi.sub, nom: moi.name ?? "Profil LinkedIn", jeton: JSON.stringify(identifiants) };
}

async function api(c: IdentifiantsLinkedin, chemin: string, init: RequestInit) {
  const r = await fetch(`https://api.linkedin.com/rest${chemin}`, {
    ...init,
    signal: AbortSignal.timeout(30_000),
    headers: {
      Authorization: `Bearer ${c.acces}`,
      "LinkedIn-Version": VERSION(),
      "X-Restli-Protocol-Version": "2.0.0",
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!r.ok) {
    const detail = ((await r.json().catch(() => ({}))) as { message?: string }).message;
    if (r.status === 401) throw new Error("LinkedIn : connexion expirée, reconnectez le compte (page Comptes).");
    throw new Error(`LinkedIn : ${detail ?? `erreur ${r.status}`}`);
  }
  return r;
}

// Publie sur le profil : texte, avec l'image si fournie. Une vidéo n'est pas
// envoyée par cette voie : l'image de la publication part à sa place.
export async function publierLinkedin(c: IdentifiantsLinkedin, texte: string, media: Media | null, image?: string | null) {
  if (Date.now() > c.expire) throw new Error("LinkedIn : connexion expirée (60 jours), reconnectez le compte (page Comptes).");
  let contenu: object | undefined;
  const urlImage = media?.type === "image" ? media.url : image;
  if (urlImage) {
    const img = await fetch(urlImage, { signal: AbortSignal.timeout(20_000) });
    if (img.ok) {
      const init = (await (
        await api(c, "/images?action=initializeUpload", {
          method: "POST",
          body: JSON.stringify({ initializeUploadRequest: { owner: c.auteur } }),
        })
      ).json()) as { value: { uploadUrl: string; image: string } };
      const envoi = await fetch(init.value.uploadUrl, {
        method: "PUT",
        headers: { Authorization: `Bearer ${c.acces}` },
        body: new Uint8Array(await img.arrayBuffer()),
      });
      if (envoi.ok) contenu = { media: { id: init.value.image } };
    }
  }
  const r = await api(c, "/posts", {
    method: "POST",
    body: JSON.stringify({
      author: c.auteur,
      commentary: texteLinkedin(texte),
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
      ...(contenu ? { content: contenu } : {}),
    }),
  });
  return r.headers.get("x-restli-id") ?? "publié";
}
