import { adapterTexteBluesky, facettesLiens } from "./bluesky";
import type { Media } from "./zernio.server";

const XRPC = "https://bsky.social/xrpc";
export type IdentifiantsBluesky = { identifiant: string; motDePasse: string };

async function xrpc<T>(methode: string, init: RequestInit & { jeton?: string } = {}): Promise<T> {
  const r = await fetch(`${XRPC}/${methode}`, {
    ...init,
    signal: AbortSignal.timeout(20_000),
    headers: {
      ...(init.body && !(init.body instanceof Uint8Array) ? { "Content-Type": "application/json" } : {}),
      ...(init.jeton ? { Authorization: `Bearer ${init.jeton}` } : {}),
      ...init.headers,
    },
  });
  const json = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!r.ok) {
    if (r.status === 401) throw new Error("Bluesky : identifiant ou mot de passe d'application incorrect.");
    throw new Error(`Bluesky : ${json.message || json.error || `erreur ${r.status}`}`);
  }
  return json as T;
}

export async function sessionBluesky(c: IdentifiantsBluesky) {
  return xrpc<{ accessJwt: string; did: string; handle: string }>("com.atproto.server.createSession", {
    method: "POST",
    body: JSON.stringify({ identifier: c.identifiant.replace(/^@/, "").trim(), password: c.motDePasse.trim() }),
  });
}

// Publie un post (texte ≤ 300 caractères, liens cliquables, image si fournie).
// Bluesky n'accepte pas les vidéos par cette voie : on publie alors le texte seul.
export async function publierBluesky(c: IdentifiantsBluesky, texte: string, media: Media | null, image?: string | null) {
  const s = await sessionBluesky(c);
  const texteFinal = adapterTexteBluesky(texte);
  let embed: object | undefined;
  const urlImage = media?.type === "image" ? media.url : image;
  if (urlImage) {
    const r = await fetch(urlImage, { signal: AbortSignal.timeout(20_000) });
    const donnees = new Uint8Array(await r.arrayBuffer());
    // Limite Bluesky : 1 Mo par image.
    if (r.ok && donnees.length < 950_000) {
      const { blob } = await xrpc<{ blob: object }>("com.atproto.repo.uploadBlob", {
        method: "POST",
        jeton: s.accessJwt,
        headers: { "Content-Type": r.headers.get("content-type") ?? "image/jpeg" },
        body: donnees,
      });
      embed = { $type: "app.bsky.embed.images", images: [{ alt: texteFinal.slice(0, 280), image: blob }] };
    }
  }
  const post = await xrpc<{ uri: string }>("com.atproto.repo.createRecord", {
    method: "POST",
    jeton: s.accessJwt,
    body: JSON.stringify({
      repo: s.did,
      collection: "app.bsky.feed.post",
      record: {
        $type: "app.bsky.feed.post",
        text: texteFinal,
        facets: facettesLiens(texteFinal),
        langs: ["fr"],
        createdAt: new Date().toISOString(),
        ...(embed ? { embed } : {}),
      },
    }),
  });
  return post.uri;
}
