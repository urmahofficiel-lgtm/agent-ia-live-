import { URL_SITE } from "./preparation.server";
import { creerEtat } from "./meta.server";
import type { Media } from "./zernio.server";

// Threads en direct (API Threads de Meta, gratuite) : connexion du compte avec
// la page d'autorisation Threads, puis publication texte + image ou vidéo.
// Clés THREADS_APP_ID / THREADS_APP_SECRET (cas d'usage « Threads » de l'app
// Meta de Younes). N'occupe pas de place chez Zernio.

export const GRAPH_THREADS = "https://graph.threads.net/v1.0";
export const RETOUR_THREADS = `${URL_SITE}/api/threads/retour`;
const PORTEE = ["threads_basic", "threads_content_publish"].join(",");
export const LIMITE_THREADS = 500;

export const threadsConfigure = () => Boolean(process.env.THREADS_APP_ID && process.env.THREADS_APP_SECRET);

export function cleThreads() {
  const appId = process.env.THREADS_APP_ID;
  const secret = process.env.THREADS_APP_SECRET;
  if (!appId || !secret) throw new Error("Clés THREADS_APP_ID / THREADS_APP_SECRET absentes des variables Vercel.");
  return { appId, secret };
}

export function urlConnexionThreads(userId: string) {
  const { appId, secret } = cleThreads();
  return `https://threads.net/oauth/authorize?${new URLSearchParams({
    client_id: appId,
    redirect_uri: RETOUR_THREADS,
    scope: PORTEE,
    response_type: "code",
    state: creerEtat(userId, secret),
  })}`;
}

async function appel<T>(url: string, params: Record<string, string>, methode: "GET" | "POST" = "GET", delai = 20_000): Promise<T> {
  const q = new URLSearchParams(params);
  const r =
    methode === "GET"
      ? await fetch(`${url}?${q}`, { signal: AbortSignal.timeout(delai) })
      : await fetch(url, {
          method: "POST",
          body: q,
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          signal: AbortSignal.timeout(delai),
        });
  const j = (await r.json().catch(() => ({}))) as T & { error?: { message?: string; error_user_msg?: string }; error_message?: string };
  if (!r.ok || j.error) throw new Error(`Threads : ${j.error?.error_user_msg || j.error?.message || j.error_message || `erreur ${r.status}`}`);
  return j;
}

// Code → jeton court → jeton 60 jours → profil.
export async function compteDepuisCodeThreads(code: string) {
  const { appId, secret } = cleThreads();
  const court = await appel<{ access_token: string; user_id?: string | number }>(
    "https://graph.threads.net/oauth/access_token",
    { client_id: appId, client_secret: secret, grant_type: "authorization_code", redirect_uri: RETOUR_THREADS, code },
    "POST",
  );
  const long = await appel<{ access_token: string }>("https://graph.threads.net/access_token", {
    grant_type: "th_exchange_token",
    client_secret: secret,
    access_token: court.access_token,
  });
  const moi = await appel<{ id: string; username?: string }>(`${GRAPH_THREADS}/me`, { fields: "id,username", access_token: long.access_token });
  return { externe: String(moi.id ?? court.user_id), nom: moi.username ?? "Threads", jeton: long.access_token };
}

// Le jeton dure 60 jours ; on le prolonge à chaque publication (possible dès
// qu'il a plus de 24 h). En cas d'échec on garde l'ancien.
export async function prolongerJetonThreads(jeton: string) {
  try {
    const r = await appel<{ access_token: string }>("https://graph.threads.net/refresh_access_token", {
      grant_type: "th_refresh_token",
      access_token: jeton,
    });
    return r.access_token;
  } catch {
    return null;
  }
}

// Threads coupe à 500 caractères : on raccourcit au dernier mot entier.
// Les hashtags de fin sont retirés d'abord (Threads n'en garde qu'un, en sujet).
export function texteThreads(texte: string) {
  let t = texte.trim();
  const tags = t.match(/(?:\s#[\p{L}\p{N}_]+)+\s*$/u);
  if (tags) {
    const premier = tags[0].trim().split(/\s+/)[0];
    t = `${t.slice(0, tags.index).trimEnd()}\n\n${premier}`;
  }
  if (t.length <= LIMITE_THREADS) return t;
  const coupe = t.slice(0, LIMITE_THREADS - 1);
  const fin = coupe.lastIndexOf(" ");
  return `${(fin > LIMITE_THREADS * 0.6 ? coupe.slice(0, fin) : coupe).trimEnd()}…`;
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Publication en deux temps : conteneur (texte + média), attente de son
// traitement par Threads, puis mise en ligne. Renvoie l'identifiant du post.
export async function publierThreads(userId: string, jeton: string, texte: string, media: Media | null, image?: string | null) {
  const params: Record<string, string> = { text: texteThreads(texte), access_token: jeton };
  if (media?.type === "video" && media.url) Object.assign(params, { media_type: "VIDEO", video_url: media.url });
  else if (media?.url || image) Object.assign(params, { media_type: "IMAGE", image_url: (media?.url ?? image) as string });
  else params.media_type = "TEXT";

  const { id: conteneur } = await appel<{ id: string }>(`${GRAPH_THREADS}/${userId}/threads`, params, "POST");
  if (params.media_type !== "TEXT") {
    const limite = Date.now() + (params.media_type === "VIDEO" ? 150_000 : 45_000);
    for (;;) {
      await pause(4000);
      const s = await appel<{ status?: string; error_message?: string }>(`${GRAPH_THREADS}/${conteneur}`, {
        fields: "status,error_message",
        access_token: jeton,
      });
      if (s.status === "FINISHED") break;
      if (s.status === "ERROR" || s.status === "EXPIRED") throw new Error(`Threads : média refusé (${s.error_message ?? s.status}).`);
      if (Date.now() > limite) throw new Error("Threads : média trop long à traiter, nouvel essai au prochain passage.");
    }
  }
  const post = await appel<{ id: string }>(`${GRAPH_THREADS}/${userId}/threads_publish`, { creation_id: conteneur, access_token: jeton }, "POST");
  return post.id;
}
