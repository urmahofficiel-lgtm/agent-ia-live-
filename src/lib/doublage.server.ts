import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { demanderIA } from "./ia.server";
import { cheminFfmpeg, executer } from "./video.server";
import { enWav, voixOff } from "./voix.server";
import {
  CONSIGNE_ECOUTE,
  VOIX_GEMINI,
  appliquerRelecture,
  attribuerVoix,
  consigneRelecture,
  genreDe,
  lireEcoute,
  placesDisponibles,
  repliquesDepuisMots,
  styleReplique,
  vitessePour,
  type Mot,
  type Personnage,
  type Replique,
  type VoixDispo,
} from "./doublage";

// Doublage d'une vidéo, en trois étapes reprises d'un passage du moteur à
// l'autre : 1. écouter (transcription minutée, qui parle) et regarder (textes
// à l'écran, rôle de chaque personnage) ; 2. refaire chaque réplique avec la
// voix de son personnage ; 3. remixer la bande son à l'identique, sans toucher
// aux images. Voix Gemini (clé déjà en place) ; voix ElevenLabs si la clé
// ELEVENLABS_API_KEY est ajoutée.

const ELEVEN = "https://api.elevenlabs.io/v1";
const cleEleven = () => process.env.ELEVENLABS_API_KEY ?? "";
export const voixElevenDisponibles = () => Boolean(cleEleven());

export type Analyse = {
  duree: number;
  repliques: Replique[];
  personnages: (Personnage & { voix: string; nom_voix: string })[];
  moteur: "elevenlabs" | "gemini";
};

// Durée d'un média (lue dans la sortie de ffmpeg).
function dureeMedia(fichier: string, dossier: string) {
  return new Promise<number>((resolve) => {
    const p = spawn(cheminFfmpeg(), ["-hide_banner", "-i", fichier], { cwd: dossier });
    let sortie = "";
    p.stderr.on("data", (d) => (sortie += d.toString()));
    p.on("close", () => {
      const m = sortie.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
      resolve(m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0);
    });
    p.on("error", () => resolve(0));
  });
}

async function dansDossier<T>(travail: (dossier: string) => Promise<T>): Promise<T> {
  const dossier = await mkdtemp(path.join(tmpdir(), "doublage-"));
  try {
    return await travail(dossier);
  } finally {
    await rm(dossier, { recursive: true, force: true });
  }
}

// --- 1. Écouter et regarder ------------------------------------------------------

async function ecouterEleven(mp3: Buffer): Promise<Replique[]> {
  const form = new FormData();
  form.append("model_id", "scribe_v1");
  form.append("language_code", "fra");
  form.append("diarize", "true");
  form.append("timestamps_granularity", "word");
  form.append("tag_audio_events", "false");
  form.append("file", new Blob([new Uint8Array(mp3)], { type: "audio/mpeg" }), "voix.mp3");
  const r = await fetch(`${ELEVEN}/speech-to-text`, {
    method: "POST",
    headers: { "xi-api-key": cleEleven() },
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  if (!r.ok) throw new Error(`Transcription ElevenLabs refusée (${r.status}).`);
  const json = (await r.json()) as { words?: { text?: string; start?: number; end?: number; type?: string; speaker_id?: string | null }[] };
  const mots: Mot[] = (json.words ?? [])
    .filter((w) => w.type === "word" && w.text)
    .map((w) => ({ texte: w.text!, debut: w.start ?? 0, fin: w.end ?? w.start ?? 0, locuteur: w.speaker_id ?? null }));
  return repliquesDepuisMots(mots);
}

async function ecouterGemini(mp3: Buffer): Promise<Replique[]> {
  const reponse = await demanderIA(CONSIGNE_ECOUTE, {
    systeme: "Tu transcris des vidéos en français avec précision. Tu réponds uniquement en JSON valide.",
    maxTokens: 8000,
    delaiTotal: 110_000,
    images: [{ mime: "audio/mp3", donnees: mp3.toString("base64") }],
  });
  return lireEcoute(reponse);
}

// Voix ElevenLabs du compte, plus celles imposées par ELEVENLABS_VOIX
// (« id:femme,id:homme »).
async function voixEleven(): Promise<VoixDispo[]> {
  const imposees: VoixDispo[] = (process.env.ELEVENLABS_VOIX ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const [id, genre] = x.split(":");
      return { id: id.trim(), nom: id.trim(), genre: genreDe(genre), francaise: true };
    });
  const r = await fetch(`${ELEVEN}/voices`, { headers: { "xi-api-key": cleEleven() }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
  const json = r?.ok ? ((await r.json()) as { voices?: { voice_id: string; name?: string; labels?: Record<string, string> }[] }) : { voices: [] };
  const compte = (json.voices ?? []).map((v) => ({
    id: v.voice_id,
    nom: v.name ?? v.voice_id,
    genre: genreDe(v.labels?.gender),
    francaise: /fr|french|fran/i.test(`${v.labels?.language ?? ""} ${v.labels?.accent ?? ""}`),
  }));
  return [...imposees, ...compte.filter((v) => !imposees.some((i) => i.id === v.id))];
}

export async function analyserVideo(video: Buffer, contexte: string | null): Promise<Analyse> {
  return dansDossier(async (dossier) => {
    await writeFile(path.join(dossier, "v.mp4"), video);
    const duree = await dureeMedia("v.mp4", dossier);
    if (!duree) throw new Error("Vidéo illisible.");
    if (duree > 600) throw new Error("Vidéo trop longue : 10 minutes au plus.");
    const eleven = voixElevenDisponibles();

    // La bande son, en mono léger.
    await executer(["-i", "v.mp4", "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "32k", "voix.mp3"], dossier).catch(() => {
      throw new Error("La vidéo n'a pas de son à doubler.");
    });
    const mp3 = await readFile(path.join(dossier, "voix.mp3"));
    let repliques = eleven ? await ecouterEleven(mp3).catch(() => ecouterGemini(mp3)) : await ecouterGemini(mp3);
    repliques = repliques.filter((r) => r.debut < duree);
    if (!repliques.length) throw new Error("Aucune parole entendue dans la vidéo.");

    // Une planche de 16 images : textes à l'écran et personnages.
    const pas = Math.max(1, duree / 16);
    await executer(["-i", "v.mp4", "-vf", `fps=1/${pas.toFixed(2)},scale=480:-2,tile=4x4`, "-frames:v", "1", "-q:v", "4", "planche.jpg"], dossier).catch(() => {});
    const planche = await readFile(path.join(dossier, "planche.jpg")).catch(() => null);
    const relecture = await demanderIA(consigneRelecture(repliques, contexte), {
      systeme: "Tu corriges des transcriptions de vidéos en français. Tu réponds uniquement en JSON valide.",
      maxTokens: 8000,
      delaiTotal: 90_000,
      images: planche ? [{ mime: "image/jpeg", donnees: planche.toString("base64") }] : [],
    }).catch(() => null);
    const lu = appliquerRelecture(repliques, relecture);

    const dispo: VoixDispo[] = eleven ? await voixEleven() : VOIX_GEMINI;
    const choix = attribuerVoix(lu.personnages, lu.repliques, dispo.length ? dispo : VOIX_GEMINI);
    const moteur = eleven && dispo.length ? "elevenlabs" : "gemini";
    return {
      duree,
      repliques: lu.repliques,
      personnages: lu.personnages.map((p) => ({ ...p, voix: choix[p.id] ?? "", nom_voix: dispo.find((v) => v.id === choix[p.id])?.nom ?? "" })),
      moteur,
    };
  });
}

// --- 2. Voix d'une réplique ------------------------------------------------------

async function parlerEleven(texte: string, voix: string, avant: string, apres: string): Promise<Buffer> {
  const r = await fetch(`${ELEVEN}/text-to-speech/${encodeURIComponent(voix)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": cleEleven(), "Content-Type": "application/json" },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      text: texte,
      model_id: process.env.ELEVENLABS_MODELE || "eleven_multilingual_v2",
      previous_text: avant || undefined,
      next_text: apres || undefined,
      voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true },
    }),
  });
  if (!r.ok) throw new Error(`Voix ElevenLabs refusée (${r.status}).`);
  return Buffer.from(await r.arrayBuffer());
}

// Réplique → MP3 (et sa durée). Gemini : la façon de dire suit le rôle et la
// phrase (question, réponse, enthousiasme), comme une vraie conversation.
export async function voixReplique(a: Analyse, i: number): Promise<{ mp3: Buffer; duree: number }> {
  const r = a.repliques[i];
  const p = a.personnages.find((x) => x.id === r.locuteur) ?? a.personnages[0];
  return dansDossier(async (dossier) => {
    let fichier: string;
    if (a.moteur === "elevenlabs") {
      fichier = "r.mp3";
      await writeFile(path.join(dossier, fichier), await parlerEleven(r.texte, p.voix, a.repliques[i - 1]?.texte ?? "", a.repliques[i + 1]?.texte ?? ""));
    } else {
      const son = await voixOff(r.texte, styleReplique(p, r.texte), p.voix || "Kore");
      if (!son) throw new Error("Voix Gemini indisponible pour le moment.");
      fichier = "r.wav";
      await writeFile(path.join(dossier, fichier), enWav(son));
    }
    // Les blancs au début et à la fin sont retirés : la voix part pile au
    // moment de la réplique d'origine.
    await executer(
      [
        "-i", fichier,
        "-af", "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,aresample=44100",
        "-ac", "1", "-c:a", "libmp3lame", "-b:a", "96k", "sortie.mp3",
      ],
      dossier,
    );
    return { mp3: await readFile(path.join(dossier, "sortie.mp3")), duree: await dureeMedia("sortie.mp3", dossier) };
  });
}

// --- 3. Mixage -------------------------------------------------------------------

export async function mixerDoublage(video: Buffer, a: Analyse, voix: { mp3: Buffer; duree: number }[]): Promise<Buffer> {
  return dansDossier(async (dossier) => {
    await writeFile(path.join(dossier, "v.mp4"), video);
    for (const [i, v] of voix.entries()) await writeFile(path.join(dossier, `r${i}.mp3`), v.mp3);
    const places = placesDisponibles(a.repliques, a.duree);
    const filtres = voix.map((v, i) => {
      const vitesse = vitessePour(v.duree, places[i]);
      const ms = Math.round(a.repliques[i].debut * 1000);
      return `[${i + 1}:a]aresample=44100,${vitesse > 1 ? `atempo=${vitesse},` : ""}adelay=${ms}|${ms}[a${i}]`;
    });
    filtres.push(
      `${voix.map((_, i) => `[a${i}]`).join("")}amix=inputs=${voix.length}:duration=longest:normalize=0,apad,atrim=0:${a.duree.toFixed(2)},alimiter=limit=0.95[voix]`,
    );
    await writeFile(path.join(dossier, "filtres.txt"), filtres.join(";\n"));
    await executer(
      [
        "-i", "v.mp4",
        ...voix.flatMap((_, i) => ["-i", `r${i}.mp3`]),
        "-filter_complex_script", "filtres.txt",
        "-map", "0:v",
        "-map", "[voix]",
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "160k",
        "-movflags", "+faststart",
        "final.mp4",
      ],
      dossier,
    );
    return readFile(path.join(dossier, "final.mp4"));
  });
}
