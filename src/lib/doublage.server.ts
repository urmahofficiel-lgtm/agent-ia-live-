import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { demanderIA } from "./ia.server";
import { cheminFfmpeg, executer } from "./video.server";
import { enWav, voixOff } from "./voix.server";
import {
  CONSIGNE_ECOUTE,
  appliquerRelecture,
  attribuerVoix,
  consigneRelecture,
  genreDe,
  lireEcoute,
  placesDisponibles,
  repliquesDepuisMots,
  vitessePour,
  type Mot,
  type Personnage,
  type Replique,
  type VoixDispo,
} from "./doublage";

// Doublage d'une vidéo : le logiciel l'écoute (transcription minutée, qui
// parle), la regarde (textes à l'écran pour corriger la transcription, rôle de
// chaque personnage), puis refait chaque réplique avec une voix réaliste
// (ElevenLabs, clé ELEVENLABS_API_KEY) posée exactement à sa place. Les
// images ne changent pas. Sans clé ElevenLabs : Gemini (écoute et voix).

const ELEVEN = "https://api.elevenlabs.io/v1";
const cleEleven = () => process.env.ELEVENLABS_API_KEY ?? "";
export const voixRealistesDisponibles = () => Boolean(cleEleven());

// Voix Gemini de secours, par genre.
const GEMINI_VOIX = { femme: ["Kore", "Leda", "Aoede"], homme: ["Puck", "Charon", "Fenrir", "Orus"] };

export type Doublage = {
  video: Buffer;
  repliques: Replique[];
  personnages: (Personnage & { voix: string })[];
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

// --- Écouter ---------------------------------------------------------------------

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
  if (!r.ok) throw new Error(`Transcription ElevenLabs refusée (${r.status}) : ${(await r.text()).slice(0, 200)}`);
  const json = (await r.json()) as { words?: { text?: string; start?: number; end?: number; type?: string; speaker_id?: string | null }[] };
  const mots: Mot[] = (json.words ?? [])
    .filter((w) => w.type === "word" && w.text)
    .map((w) => ({ texte: w.text!, debut: w.start ?? 0, fin: w.end ?? w.start ?? 0, locuteur: w.speaker_id ?? null }));
  return repliquesDepuisMots(mots);
}

async function ecouterGemini(mp3: Buffer): Promise<Replique[]> {
  const reponse = await demanderIA(CONSIGNE_ECOUTE, {
    systeme: "Tu transcris des vidéos en français avec précision. Tu réponds uniquement en JSON valide.",
    maxTokens: 6000,
    delaiTotal: 90_000,
    images: [{ mime: "audio/mp3", donnees: mp3.toString("base64") }],
  });
  return lireEcoute(reponse);
}

// --- Voix ------------------------------------------------------------------------

// Voix du compte ElevenLabs (avec les voix ajoutées depuis la bibliothèque),
// plus celles imposées par ELEVENLABS_VOIX (« id:femme,id:homme »).
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

async function parlerEleven(texte: string, voix: string, avant: string, apres: string): Promise<Buffer> {
  const r = await fetch(`${ELEVEN}/text-to-speech/${encodeURIComponent(voix)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": cleEleven(), "Content-Type": "application/json" },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      text: texte,
      model_id: process.env.ELEVENLABS_MODELE || "eleven_multilingual_v2",
      // Les phrases autour : l'intonation suit la conversation.
      previous_text: avant || undefined,
      next_text: apres || undefined,
      voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true },
    }),
  });
  if (!r.ok) throw new Error(`Voix ElevenLabs refusée (${r.status}) : ${(await r.text()).slice(0, 200)}`);
  return Buffer.from(await r.arrayBuffer());
}

async function parlerGemini(texte: string, voix: string): Promise<Buffer> {
  const a = await voixOff(texte, "voix française naturelle, comme une vraie personne qui parle, ton conversationnel", voix);
  if (!a) throw new Error("Voix Gemini indisponible.");
  return enWav(a);
}

// Exécute `taches` au plus `n` à la fois.
async function parPaquets<T>(taches: (() => Promise<T>)[], n: number): Promise<T[]> {
  const sortie: T[] = new Array(taches.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, taches.length) }, async () => {
      while (i < taches.length) {
        const k = i++;
        sortie[k] = await taches[k]();
      }
    }),
  );
  return sortie;
}

// --- Doubler ---------------------------------------------------------------------

export async function doublerVideo(
  video: Buffer,
  contexte: string | null,
  journal: (m: string) => unknown = () => {},
): Promise<Doublage> {
  const dossier = await mkdtemp(path.join(tmpdir(), "doublage-"));
  try {
    await writeFile(path.join(dossier, "v.mp4"), video);
    const duree = await dureeMedia("v.mp4", dossier);
    if (!duree) throw new Error("Vidéo illisible.");
    if (duree > 600) throw new Error("Vidéo trop longue : 10 minutes au plus.");
    const eleven = voixRealistesDisponibles();

    // 1. Écouter : la bande son, en mono léger.
    await executer(["-i", "v.mp4", "-vn", "-ac", "1", "-ar", "22050", "-c:a", "libmp3lame", "-b:a", "48k", "voix.mp3"], dossier);
    const mp3 = await readFile(path.join(dossier, "voix.mp3"));
    journal("Écoute de la vidéo…");
    let repliques = eleven ? await ecouterEleven(mp3).catch(() => ecouterGemini(mp3)) : await ecouterGemini(mp3);
    repliques = repliques.filter((r) => r.debut < duree);
    if (!repliques.length) throw new Error("Aucune parole entendue dans la vidéo.");

    // 2. Regarder : une planche de 16 images pour corriger le texte et
    // reconnaître les personnages.
    journal(`${repliques.length} répliques entendues. Lecture des images…`);
    const pas = Math.max(1, duree / 16);
    await executer(["-i", "v.mp4", "-vf", `fps=1/${pas.toFixed(2)},scale=480:-2,tile=4x4`, "-frames:v", "1", "-q:v", "4", "planche.jpg"], dossier);
    const planche = await readFile(path.join(dossier, "planche.jpg")).catch(() => null);
    const relecture = await demanderIA(consigneRelecture(repliques, contexte), {
      systeme: "Tu corriges des transcriptions de vidéos en français. Tu réponds uniquement en JSON valide.",
      maxTokens: 6000,
      delaiTotal: 80_000,
      images: planche ? [{ mime: "image/jpeg", donnees: planche.toString("base64") }] : [],
    }).catch(() => null);
    const lu = appliquerRelecture(repliques, relecture);
    repliques = lu.repliques;

    // 3. Une voix par personnage.
    const dispo: VoixDispo[] = eleven
      ? await voixEleven()
      : [
          ...GEMINI_VOIX.femme.map((id) => ({ id, nom: id, genre: "femme" as const, francaise: true })),
          ...GEMINI_VOIX.homme.map((id) => ({ id, nom: id, genre: "homme" as const, francaise: true })),
        ];
    if (!dispo.length) throw new Error("Aucune voix disponible sur le compte ElevenLabs.");
    const choix = attribuerVoix(lu.personnages, repliques, dispo);
    journal(`Voix : ${lu.personnages.map((p) => `${p.role} → ${dispo.find((v) => v.id === choix[p.id])?.nom ?? "?"}`).join(", ")}`);

    // 4. Chaque réplique, avec sa voix (4 à la fois).
    const audios = await parPaquets(
      repliques.map((r, i) => async () => {
        const voix = choix[r.locuteur] ?? dispo[0].id;
        const son = eleven
          ? await parlerEleven(r.texte, voix, repliques[i - 1]?.texte ?? "", repliques[i + 1]?.texte ?? "")
          : await parlerGemini(r.texte, voix);
        const nom = `r${i}.${eleven ? "mp3" : "wav"}`;
        await writeFile(path.join(dossier, nom), son);
        return { nom, duree: await dureeMedia(nom, dossier) };
      }),
      4,
    );

    // 5. Mixage : chaque voix à l'instant exact de la réplique d'origine,
    // accélérée si besoin pour tenir dans sa place ; les images ne bougent pas.
    journal("Mixage des nouvelles voix…");
    const places = placesDisponibles(repliques, duree);
    const filtres = audios.map((a, i) => {
      const v = vitessePour(a.duree, places[i]);
      const ms = Math.round(repliques[i].debut * 1000);
      return `[${i + 1}:a]aresample=44100,${v > 1 ? `atempo=${v},` : ""}adelay=${ms}|${ms}[a${i}]`;
    });
    filtres.push(`${audios.map((_, i) => `[a${i}]`).join("")}amix=inputs=${audios.length}:duration=longest:normalize=0,apad,atrim=0:${duree.toFixed(2)},alimiter=limit=0.95[voix]`);
    await writeFile(path.join(dossier, "filtres.txt"), filtres.join(";\n"));
    await executer(
      [
        "-i", "v.mp4",
        ...audios.flatMap((a) => ["-i", a.nom]),
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
    return {
      video: await readFile(path.join(dossier, "final.mp4")),
      repliques,
      personnages: lu.personnages.map((p) => ({ ...p, voix: dispo.find((v) => v.id === choix[p.id])?.nom ?? "" })),
      moteur: eleven ? "elevenlabs" : "gemini",
    };
  } finally {
    await rm(dossier, { recursive: true, force: true });
  }
}
