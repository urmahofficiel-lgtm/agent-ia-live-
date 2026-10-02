// Grok Imagine (xAI) : génération de vidéo à partir d'une image et d'une
// consigne, puis prolongation. Clé XAI_API_KEY (console.x.ai). Toutes les
// opérations sont asynchrones : on reçoit un request_id à suivre.

const API = "https://api.x.ai/v1/videos";

export const xaiConfigure = () => Boolean(process.env.XAI_API_KEY);

async function appel<T>(chemin: string, corps?: object): Promise<T> {
  const cle = process.env.XAI_API_KEY;
  if (!cle)
    throw new Error(
      "Studio vidéo non activé : ajoutez la clé XAI_API_KEY dans Vercel.",
    );
  const r = await fetch(`${API}${chemin}`, {
    method: corps ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${cle}`,
      "Content-Type": "application/json",
    },
    body: corps ? JSON.stringify(corps) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await r.json().catch(() => ({}))) as T & {
    error?: { message?: string } | string;
    code?: string;
  };
  if (!r.ok) {
    const e =
      typeof json.error === "string"
        ? json.error
        : (json.error?.message ?? json.code);
    if (r.status === 401)
      throw new Error(
        "Clé XAI_API_KEY refusée par xAI : vérifiez-la dans Vercel.",
      );
    if (r.status === 402 || r.status === 429)
      throw new Error(
        `xAI : crédit épuisé ou trop de demandes (${r.status}). ${e ?? ""}`.trim(),
      );
    throw new Error(`xAI a refusé la demande (${r.status}) : ${e ?? "erreur"}`);
  }
  return json;
}

export async function genererVideo(p: {
  modele: string;
  prompt: string;
  imageUrl: string;
  duree: number;
  format: string;
}) {
  const { request_id } = await appel<{ request_id: string }>("/generations", {
    model: p.modele,
    prompt: p.prompt,
    image: { url: p.imageUrl },
    duration: p.duree,
    aspect_ratio: p.format,
    resolution: "720p",
  });
  if (!request_id)
    throw new Error("xAI n'a pas renvoyé d'identifiant de génération.");
  return request_id;
}

export async function prolongerVideo(p: {
  modele: string;
  prompt: string;
  videoUrl: string;
  duree: number;
}) {
  const { request_id } = await appel<{ request_id: string }>("/extensions", {
    model: p.modele,
    prompt: p.prompt,
    video: { url: p.videoUrl },
    duration: p.duree,
  });
  if (!request_id)
    throw new Error("xAI n'a pas renvoyé d'identifiant de prolongation.");
  return request_id;
}

export const statutVideo = (requestId: string) =>
  appel<unknown>(`/${encodeURIComponent(requestId)}`);
