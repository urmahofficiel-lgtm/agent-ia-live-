import { imageVersVideoHF, hfConfigure } from "./hf.server";

// Vraies vidéos IA à partir d'une image (image-to-video), avec des modèles
// chinois gratuits :
// - Wan 2.2 (Alibaba, open source) sur un espace Hugging Face ZeroGPU, avec
//   la clé HF_TOKEN : 5 min de calcul par jour sur un compte gratuit.
// - CogVideoX-Flash (Zhipu), gratuit avec une clé ZHIPU_API_KEY (bigmodel.cn).

export type MoteurVideoIA = "wan" | "cogvideox";

export const MOTEURS_VIDEO_IA: { id: MoteurVideoIA; nom: string; configure: () => boolean; dureeMax: number }[] = [
  { id: "wan", nom: "Wan 2.2 (Alibaba)", configure: hfConfigure, dureeMax: 5 },
  { id: "cogvideox", nom: "CogVideoX-Flash (Zhipu)", configure: () => Boolean(process.env.ZHIPU_API_KEY), dureeMax: 5 },
];

export const moteursDisponibles = () => MOTEURS_VIDEO_IA.filter((m) => m.configure()).map(({ id, nom, dureeMax }) => ({ id, nom, dureeMax }));

// Consigne de mouvement en anglais (les deux modèles la comprennent mieux).
export const consigneMouvement = (mouvement: string) =>
  `${mouvement.trim() || "subtle natural motion, people moving naturally"}, realistic, cinematic camera movement, smooth motion, vertical video, no text, no subtitles`;

export async function genererClipIA(moteur: MoteurVideoIA, image: Buffer, mouvement: string, duree: number, delaiMs: number): Promise<Buffer> {
  const d = Math.min(5, Math.max(2, duree));
  if (moteur === "cogvideox") return cogVideoX(image, mouvement, delaiMs);
  const r = await imageVersVideoHF({ donnees: new Blob([new Uint8Array(image)]), nom: "scene.jpg" }, consigneMouvement(mouvement), d, async () => undefined, delaiMs);
  return Buffer.from(r.donnees);
}

// --- CogVideoX-Flash (Zhipu) : tâche asynchrone, puis interrogation du résultat.
// Doc : https://docs.bigmodel.cn/api-reference/模型-api/视频生成异步
const ZHIPU = "https://open.bigmodel.cn/api/paas/v4";

async function cogVideoX(image: Buffer, mouvement: string, delaiMs: number): Promise<Buffer> {
  const cle = process.env.ZHIPU_API_KEY?.trim();
  if (!cle) throw new Error("Clé ZHIPU_API_KEY absente des variables Vercel.");
  const entetes = { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" };
  const fin = Date.now() + delaiMs;
  const r = await fetch(`${ZHIPU}/videos/generations`, {
    method: "POST",
    headers: entetes,
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      model: "cogvideox-flash",
      prompt: consigneMouvement(mouvement).slice(0, 500),
      image_url: `data:image/jpeg;base64,${image.toString("base64")}`,
      size: "960x1280",
      fps: 30,
      quality: "speed",
    }),
  });
  const tache = (await r.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!r.ok || !tache.id) throw new Error(erreurZhipu(r.status, tache.error?.message));
  while (Date.now() < fin) {
    await new Promise((ok) => setTimeout(ok, 5000));
    const q = await fetch(`${ZHIPU}/async-result/${tache.id}`, { headers: entetes, signal: AbortSignal.timeout(20_000) }).catch(() => null);
    if (!q?.ok) continue;
    const etat = (await q.json()) as { task_status?: string; video_result?: { url?: string }[] };
    if (etat.task_status === "FAIL") throw new Error("CogVideoX n'a pas réussi à créer la vidéo. Essayez une autre image ou un autre mouvement.");
    const url = etat.video_result?.[0]?.url;
    if (etat.task_status === "SUCCESS" && url) {
      const v = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!v.ok) throw new Error("Téléchargement de la vidéo CogVideoX impossible.");
      return Buffer.from(await v.arrayBuffer());
    }
  }
  throw new Error("CogVideoX met trop de temps : réessayez dans quelques minutes.");
}

export function erreurZhipu(statut: number, message?: string) {
  if (statut === 401 || statut === 403) return "Clé Zhipu invalide : vérifiez ZHIPU_API_KEY dans Vercel.";
  if (statut === 429) return "CogVideoX gratuit est saturé (trop de demandes) : réessayez dans quelques minutes.";
  return `CogVideoX a refusé la demande${message ? ` : ${message}` : ""}.`;
}
