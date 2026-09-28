import { createHmac, timingSafeEqual } from "node:crypto";
import { traduireErreurFal } from "./animation";

// fal.ai : inférence IA dans le cloud, par file d'attente asynchrone.
// Doc : https://docs.fal.ai/model-endpoints/queue
const FILE = "https://queue.fal.run";

export const falConfigure = () => Boolean(process.env.FAL_KEY);

async function appel<T>(url: string, init: RequestInit = {}): Promise<T> {
  const cle = process.env.FAL_KEY;
  if (!cle) throw new Error("Clé FAL_KEY absente des variables Vercel.");
  const r = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(30_000),
    headers: { Authorization: `Key ${cle}`, "Content-Type": "application/json", ...init.headers },
  });
  const json = (await r.json().catch(() => ({}))) as { detail?: unknown };
  if (!r.ok) {
    const detail = typeof json.detail === "string" ? json.detail : Array.isArray(json.detail) ? JSON.stringify(json.detail).slice(0, 200) : undefined;
    throw new Error(traduireErreurFal(r.status, detail));
  }
  return json as T;
}

export function soumettre(modele: string, entree: Record<string, unknown>, webhook: string) {
  return appel<{ request_id: string }>(`${FILE}/${modele}?fal_webhook=${encodeURIComponent(webhook)}`, {
    method: "POST",
    body: JSON.stringify(entree),
  });
}

export function statutRequete(modele: string, id: string) {
  return appel<{ status?: string; queue_position?: number }>(`${FILE}/${modele}/requests/${id}/status`);
}

export function resultatRequete(modele: string, id: string) {
  return appel<{ video?: { url?: string } }>(`${FILE}/${modele}/requests/${id}`);
}

// Jeton glissé dans l'adresse du webhook : prouve que l'appel vient d'une
// demande que nous avons faite. Le résultat est de toute façon relu chez
// fal.ai avec notre clé, jamais pris tel quel dans le corps reçu.
export function jetonWebhook(animationId: string) {
  return createHmac("sha256", process.env.AGENT_TICK_SECRET ?? "").update(`animation:${animationId}`).digest("base64url");
}

export function jetonWebhookValide(animationId: string, jeton: string) {
  const attendu = Buffer.from(jetonWebhook(animationId));
  const recu = Buffer.from(jeton);
  return attendu.length === recu.length && timingSafeEqual(attendu, recu);
}
