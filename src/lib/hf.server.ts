import type { ModeAnimation } from "./animation";
import { traduireErreurHF } from "./animation";

// Hugging Face Spaces (ZeroGPU) : les mêmes modèles, gratuitement. Un compte
// gratuit dispose de 5 minutes de GPU par jour (40 avec l'offre PRO).
// Protocole HTTP de Gradio : envoi des fichiers, appel, puis flux d'événements.
export const ESPACES_HF: Record<
  ModeAnimation,
  { id: string; hote: string; prefixe: string; point: string }
> = {
  visage: {
    id: "KlingTeam/LivePortrait",
    hote: "https://klingteam-liveportrait.hf.space",
    prefixe: "",
    point: "gpu_wrapped_execute_video",
  },
  corps: {
    id: "alexnasa/Wan2.2-Animate-ZEROGPU",
    hote: "https://alexnasa-wan2-2-animate-zerogpu.hf.space",
    prefixe: "/gradio_api",
    point: "animate_scene",
  },
};

// Le modèle « corps entier » réserve 110 à 150 s de GPU pour 2 à 5 s de vidéo :
// au-delà, le quota gratuit du jour ne suffirait pas.
export const SECONDES_CORPS_GRATUIT = 5;

export const hfConfigure = () => Boolean(process.env.HF_TOKEN);

type Fichier = {
  path: string;
  url?: string;
  orig_name?: string;
  meta: { _type: "gradio.FileData" };
};
export type EtatHF = { statut: "en_file" | "en_cours"; position?: number };

// Une session HTTP avec l'espace : même jeton et mêmes cookies à chaque appel
// (un espace peut tourner sur plusieurs machines).
type Espace = { id: string; hote: string; prefixe: string; point: string };

function session(espace: Espace) {
  const base = espace.hote + espace.prefixe;
  let cookies = "";
  const entetes = (autres: Record<string, string> = {}) => ({
    ...(process.env.HF_TOKEN
      ? { Authorization: `Bearer ${process.env.HF_TOKEN.trim()}` }
      : {}),
    ...(cookies ? { Cookie: cookies } : {}),
    ...autres,
  });
  const retenir = (r: Response) => {
    const nouveaux =
      r.headers.getSetCookie?.().map((c) => c.split(";")[0]) ?? [];
    if (nouveaux.length)
      cookies = [
        ...new Set([...cookies.split("; ").filter(Boolean), ...nouveaux]),
      ].join("; ");
  };
  const appel = async (
    chemin: string,
    init: RequestInit = {},
    delai = 60_000,
  ) => {
    const r = await fetch(base + chemin, {
      ...init,
      headers: entetes(init.headers as Record<string, string>),
      signal: init.signal ?? AbortSignal.timeout(delai),
    });
    retenir(r);
    if (!r.ok)
      throw new Error(
        traduireErreurHF(
          `${r.status} ${(await r.text().catch(() => "")).slice(0, 200)}`,
        ),
      );
    return r;
  };
  return { espace, appel };
}

export async function animerAvecHF(
  mode: ModeAnimation,
  photo: { donnees: Blob; nom: string },
  video: { donnees: Blob; duree: number },
  surEtat: (e: EtatHF) => Promise<void>,
  delaiMs: number,
): Promise<{ donnees: Uint8Array; source: string }> {
  return executerGradio(
    ESPACES_HF[mode],
    [
      { donnees: photo.donnees, nom: photo.nom },
      { donnees: video.donnees, nom: "mouvement.mp4" },
    ],
    ([image, film]) =>
      mode === "visage"
        ? [image, { video: film, subtitles: null }, true, true, true] // mouvement relatif, recadrage, recollage
        : [
            { video: film, subtitles: null },
            Math.min(
              SECONDES_CORPS_GRATUIT,
              Math.max(2, Math.round(video.duree)),
            ),
            image,
            "Pose Retarget",
            "Low Res",
          ],
    surEtat,
    delaiMs,
  );
}

// Appel générique d'un espace Gradio : envoi des fichiers, appel du point
// d'entrée, suivi du flux d'événements, téléchargement de la vidéo produite.
async function executerGradio(
  espace: Espace,
  fichiers: { donnees: Blob; nom: string }[],
  entree: (envoyes: Fichier[]) => unknown[],
  surEtat: (e: EtatHF) => Promise<void>,
  delaiMs: number,
): Promise<{ donnees: Uint8Array; source: string }> {
  const { appel } = session(espace);
  await appel("/config").catch(() => undefined); // ouvre la session (cookies)

  const envoyer = async (donnees: Blob, nom: string): Promise<Fichier> => {
    const form = new FormData();
    form.append("files", donnees, nom);
    const [chemin] = (await (
      await appel("/upload", { method: "POST", body: form }, 120_000)
    ).json()) as string[];
    return { path: chemin, orig_name: nom, meta: { _type: "gradio.FileData" } };
  };
  const envoyes = await Promise.all(
    fichiers.map((f) => envoyer(f.donnees, f.nom)),
  );

  const { event_id } = (await (
    await appel(`/call/${espace.point}`, {
      method: "POST",
      body: JSON.stringify({ data: entree(envoyes) }),
      headers: { "Content-Type": "application/json" },
    })
  ).json()) as { event_id: string };

  // Flux SSE : « generating » pendant le calcul, « complete » avec le résultat.
  const flux = await appel(`/call/${espace.point}/${event_id}`, {
    signal: AbortSignal.timeout(delaiMs),
  });
  const lecteur = flux.body!.pipeThrough(new TextDecoderStream()).getReader();
  let tampon = "";
  let evenement = "";
  let resultat: unknown;
  await surEtat({ statut: "en_file" });
  let calcul = false;
  for (;;) {
    const { value, done } = await lecteur.read();
    if (done) break;
    tampon += value;
    const lignes = tampon.split("\n");
    tampon = lignes.pop() ?? "";
    for (const ligne of lignes) {
      if (ligne.startsWith("event:")) evenement = ligne.slice(6).trim();
      else if (ligne.startsWith("data:")) {
        const donnee = ligne.slice(5).trim();
        if (evenement === "error")
          throw new Error(traduireErreurHF(donnee === "null" ? "" : donnee));
        if (evenement === "complete") resultat = JSON.parse(donnee);
        if (evenement === "generating" && !calcul) {
          calcul = true;
          await surEtat({ statut: "en_cours" });
        }
      }
    }
    if (resultat) break;
  }
  void lecteur.cancel().catch(() => undefined);
  if (!resultat) throw new Error("Le modèle n'a renvoyé aucune vidéo.");

  // Première sortie = vidéo finale (fichier seul, ou { video, subtitles }).
  const sortie = (resultat as unknown[])[0] as
    (Fichier & { video?: Fichier }) | null;
  const fichier = sortie?.video ?? sortie;
  const source =
    fichier?.url ??
    (fichier?.path
      ? `${espace.hote}${espace.prefixe}/file=${fichier.path}`
      : null);
  if (!source) throw new Error("Vidéo absente de la réponse du modèle.");
  const r = await fetch(source, {
    headers: process.env.HF_TOKEN
      ? { Authorization: `Bearer ${process.env.HF_TOKEN.trim()}` }
      : {},
    signal: AbortSignal.timeout(90_000),
  });
  if (!r.ok) throw new Error("Téléchargement de la vidéo générée impossible.");
  return { donnees: new Uint8Array(await r.arrayBuffer()), source };
}

// --- Image + consigne → vidéo (Wan 2.2, image-to-video rapide) -------------

export const ESPACE_IMAGE_VIDEO: Espace = {
  id: "zerogpu-aoti/wan2-2-fp8da-aoti-faster",
  hote: "https://zerogpu-aoti-wan2-2-fp8da-aoti-faster.hf.space",
  prefixe: "/gradio_api",
  point: "generate_video",
};
export const SECONDES_PAR_MORCEAU = 5;

export function imageVersVideoHF(
  image: { donnees: Blob; nom: string },
  prompt: string,
  duree: number,
  surEtat: (e: EtatHF) => Promise<void>,
  delaiMs: number,
) {
  return executerGradio(
    ESPACE_IMAGE_VIDEO,
    [image],
    ([img]) => [
      img,
      prompt,
      6, // étapes (version rapide)
      "色调艳丽, 过曝, 静态, 细节模糊不清, 字幕, 风格, 作品, 画作, 画面, 静止, 整体发灰, 最差质量, 低质量, JPEG压缩残留, 丑陋的, 残缺的, 多余的手指, 画得不好的手部, 画得不好的脸部, 畸形的, 毁容的, 形态畸形的肢体, 手指融合, 静止不动的画面, 杂乱的背景, 三条腿, 背景人很多, 倒着走",
      duree,
      1,
      1,
      42,
      true,
    ],
    surEtat,
    delaiMs,
  );
}

// Diagnostic après un refus : la clé HF_TOKEN est-elle acceptée, et par quel compte ?
export async function compteHF(): Promise<{ valide: boolean; nom?: string }> {
  if (!process.env.HF_TOKEN) return { valide: false };
  try {
    const r = await fetch("https://huggingface.co/api/whoami-v2", {
      headers: { Authorization: `Bearer ${process.env.HF_TOKEN.trim()}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return { valide: false };
    const j = (await r.json()) as { name?: string };
    return { valide: true, nom: j.name };
  } catch {
    return { valide: true }; // Hugging Face injoignable : on ne conclut pas
  }
}
