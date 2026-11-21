import { URL_SITE } from "./preparation.server";
import { creerEtat } from "./meta.server";
import type { Media } from "./zernio.server";

// YouTube en direct (API YouTube Data v3, gratuite) : connexion de la chaîne
// avec Google (OAuth), puis envoi des vidéos verticales en Shorts. Clés
// YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET (projet Google Cloud de Younes).
// N'occupe pas de place chez Zernio.

export const RETOUR_YOUTUBE = `${URL_SITE}/api/youtube/retour`;
const PORTEE = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"].join(" ");

export type IdentifiantsYoutube = { rafraichir: string; chaine: string };

export const youtubeConfigure = () => Boolean(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET);

export function cleYoutube() {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const secret = process.env.YOUTUBE_CLIENT_SECRET;
  if (!clientId || !secret) throw new Error("Clés YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET absentes des variables Vercel.");
  return { clientId, secret };
}

export function urlConnexionYoutube(userId: string) {
  const { clientId, secret } = cleYoutube();
  return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: clientId,
    redirect_uri: RETOUR_YOUTUBE,
    response_type: "code",
    scope: PORTEE,
    // « offline » + « consent » : Google donne un jeton de longue durée.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: creerEtat(userId, secret),
  })}`;
}

async function jetonGoogle(corps: Record<string, string>) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(corps),
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; error?: string; error_description?: string };
  if (!r.ok || !j.access_token) {
    if (j.error === "invalid_grant") throw new Error("YouTube : connexion expirée ou retirée, reconnectez la chaîne (page Comptes).");
    throw new Error(`YouTube : ${j.error_description ?? j.error ?? "connexion refusée"}.`);
  }
  return j;
}

// Code → jeton de longue durée → chaîne YouTube du compte.
export async function compteDepuisCodeYoutube(code: string) {
  const { clientId, secret } = cleYoutube();
  const j = await jetonGoogle({ grant_type: "authorization_code", code, redirect_uri: RETOUR_YOUTUBE, client_id: clientId, client_secret: secret });
  if (!j.refresh_token) throw new Error("YouTube : Google n'a pas donné d'accès durable. Retirez l'accès dans votre compte Google puis reconnectez.");
  const r = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
    headers: { Authorization: `Bearer ${j.access_token}` },
    signal: AbortSignal.timeout(15_000),
  });
  const c = ((await r.json().catch(() => ({}))) as { items?: { id: string; snippet?: { title?: string } }[] }).items?.[0];
  if (!c) throw new Error("YouTube : aucune chaîne sur ce compte Google. Créez d'abord la chaîne sur youtube.com.");
  const identifiants: IdentifiantsYoutube = { rafraichir: j.refresh_token, chaine: c.id };
  return { externe: c.id, nom: c.snippet?.title ?? "Chaîne YouTube", jeton: JSON.stringify(identifiants) };
}

// Titre du Short : la 1re ligne du post, 100 caractères au plus, avec #Shorts.
export function titreShort(texte: string) {
  const ligne = (texte.split("\n").find((l) => l.trim() && !l.trim().startsWith("#")) ?? "Vidéo").replace(/\s+/g, " ").trim();
  const base = ligne.length > 90 ? `${ligne.slice(0, 87).trimEnd()}…` : ligne;
  return `${base} #Shorts`.slice(0, 100);
}

// Envoie la vidéo (Short vertical) : téléversement « reprenable » de Google en
// deux temps (ouverture, puis le fichier). Renvoie l'identifiant de la vidéo.
export async function publierYoutube(c: IdentifiantsYoutube, texte: string, media: Media | null) {
  if (media?.type !== "video" || !media.url) throw new Error("YouTube : il faut une vidéo (pas d'image seule).");
  const { clientId, secret } = cleYoutube();
  const { access_token } = await jetonGoogle({ grant_type: "refresh_token", refresh_token: c.rafraichir, client_id: clientId, client_secret: secret });

  const v = await fetch(media.url, { signal: AbortSignal.timeout(60_000) });
  if (!v.ok) throw new Error(`YouTube : vidéo introuvable (${v.status}).`);
  const fichier = Buffer.from(await v.arrayBuffer());

  const ouverture = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "video/mp4",
      "X-Upload-Content-Length": String(fichier.length),
    },
    body: JSON.stringify({
      snippet: { title: titreShort(texte), description: texte.slice(0, 4900), categoryId: "27" },
      status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
    }),
  });
  const adresse = ouverture.headers.get("location");
  if (!ouverture.ok || !adresse) {
    const detail = ((await ouverture.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message;
    if (ouverture.status === 403 && /quota/i.test(detail ?? "")) throw new Error("YouTube : quota du jour atteint, nouvel essai demain.");
    throw new Error(`YouTube : envoi refusé (${detail ?? ouverture.status}).`);
  }
  const envoi = await fetch(adresse, {
    method: "PUT",
    signal: AbortSignal.timeout(180_000),
    headers: { "Content-Type": "video/mp4", "Content-Length": String(fichier.length) },
    body: fichier,
  });
  const j = (await envoi.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!envoi.ok || !j.id) throw new Error(`YouTube : envoi interrompu (${j.error?.message ?? envoi.status}).`);
  return j.id;
}
