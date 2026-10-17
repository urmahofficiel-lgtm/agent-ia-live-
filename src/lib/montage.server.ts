import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MUSIQUE_FOND_BASE64 } from "./generes/musique.server";
import { cheminFfmpeg, dossierPolices, extensionImage } from "./video.server";
import { genererImage } from "./ia.server";
import { photo, pexelsConfigure, sequenceVerticale } from "./pexels.server";
import { choisirFichierVertical, type VideoPexels } from "./pexels";
import type { Audio } from "./voix.server";
import { URL_EMOJIS, XFADE, debutsScenes, dureeTransition, fichierEmoji, sousTitresMontage, type PlanMontage, type SceneMontage } from "./montage";

const L = 720;
const H = 1280;
const IPS = 30;

function executer(args: string[], dossier: string) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cheminFfmpeg(), ["-hide_banner", "-loglevel", "error", "-y", ...args], { cwd: dossier });
    let erreurs = "";
    p.stderr.on("data", (d) => (erreurs += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code} : ${erreurs.slice(-600)}`))));
  });
}

async function telecharger(url: string, max = 30_000_000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(40_000) });
  if (!r.ok) return null;
  const b = Buffer.from(await r.arrayBuffer());
  return b.length > 1000 && b.length <= max ? b : null;
}

// --- Séquences Pexels (aperçus de l'éditeur) ----------------------------------------

export type Sequence = { id: number; apercu: string; duree: number };

export async function chercherSequences(recherche: string, nombre = 8): Promise<Sequence[]> {
  const cle = process.env.PEXELS_API_KEY;
  if (!cle || !recherche.trim()) return [];
  const q = new URLSearchParams({ query: recherche, orientation: "portrait", size: "medium", per_page: String(Math.min(15, nombre + 4)) });
  const r = await fetch(`https://api.pexels.com/videos/search?${q}`, { headers: { Authorization: cle }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) return [];
  const json = (await r.json()) as { videos?: (VideoPexels & { image?: string })[] };
  return (json.videos ?? [])
    .filter((v) => v.image && choisirFichierVertical(v))
    .slice(0, nombre)
    .map((v) => ({ id: v.id, apercu: v.image!, duree: v.duration }));
}

async function sequenceChoisie(id: number) {
  const cle = process.env.PEXELS_API_KEY;
  if (!cle) return null;
  const r = await fetch(`https://api.pexels.com/videos/videos/${id}`, { headers: { Authorization: cle }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) return null;
  const f = choisirFichierVertical((await r.json()) as VideoPexels);
  return f ? telecharger(f.link) : null;
}

// --- Médias de chaque scène ----------------------------------------------------------

export type MediaScene = { clip?: Buffer; image?: Buffer };

// Pour chaque scène : la séquence choisie dans l'éditeur, sinon une vidéo
// Pexels, une photo, une image IA ; « capture » prend les écrans de l'appli.
// `fin` : heure limite (la fonction serveur dure 5 minutes au plus).
export async function preparerMedias(
  scenes: SceneMontage[],
  d: number[],
  captures: Buffer[],
  fin: number,
  journal: (m: string) => unknown = () => {},
): Promise<MediaScene[]> {
  const dejaVus = new Set<number>();
  let k = 0;
  const sortie: MediaScene[] = [];
  for (const [i, s] of scenes.entries()) {
    const reste = fin - Date.now();
    if (s.source === "capture" && captures.length) {
      sortie.push({ image: captures[k++ % captures.length] });
      continue;
    }
    if (reste > 60_000 && s.choix) {
      const clip = await sequenceChoisie(s.choix).catch(() => null);
      if (clip) {
        dejaVus.add(s.choix);
        sortie.push({ clip });
        continue;
      }
    }
    if (reste > 60_000 && s.source !== "image_ia" && pexelsConfigure() && s.recherche) {
      const clip = await sequenceVerticale(s.recherche, d[i], dejaVus).catch(() => null);
      if (clip) {
        sortie.push({ clip });
        continue;
      }
    }
    if (reste > 50_000 && (s.prompt || s.recherche)) {
      try {
        const img = await genererImage(`${s.prompt || s.recherche}. Vertical 9:16 composition, realistic photo, no text.`, "tiktok");
        sortie.push({ image: Buffer.from(img.base64, "base64") });
        continue;
      } catch {
        journal(`Image IA indisponible pour la scène ${i + 1} : photo réelle à la place.`);
      }
    }
    const img = pexelsConfigure() && s.recherche ? await photo(s.recherche, "portrait", dejaVus).catch(() => null) : null;
    sortie.push(img ? { image: img } : {});
  }
  return sortie;
}

// --- Montage ----------------------------------------------------------------------------

function filtreEffet(s: SceneMontage, duree: number, image: boolean) {
  const n = Math.max(1, Math.round(duree * IPS));
  // Les images fixes bougent toujours un peu (zoom lent), sinon l'écran paraît figé.
  const zoom =
    s.effet === "zoom_avant"
      ? `min(1+0.16*on/${n},1.16)`
      : s.effet === "zoom_arriere"
        ? `max(1.16-0.16*on/${n},1)`
        : image
          ? `min(1+0.06*on/${n},1.06)`
          : "";
  const f: string[] = [];
  if (zoom) f.push(`zoompan=z='${zoom}':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${L}x${H}:fps=${IPS}`);
  if (s.effet === "secousse") {
    f.push(`crop=${L - 40}:${H - 40}:x='20+16*sin(2*PI*t*9)*exp(-2.5*t)+3*sin(2*PI*t*1.7)':y='20+14*cos(2*PI*t*11)*exp(-2.5*t)+3*sin(2*PI*t*1.3)',scale=${L}:${H}`);
  }
  if (s.effet === "flash") f.push("fade=t=in:st=0:d=0.3:color=white");
  return f.length ? `,${f.join(",")}` : "";
}

function sonEffet(son: SceneMontage["son"]) {
  if (son === "whoosh") return "anoisesrc=d=0.45:c=pink:a=0.7,bandpass=f=1400:width_type=o:w=2.5,afade=t=in:d=0.18,afade=t=out:st=0.2:d=0.25,volume=2.2";
  if (son === "pop") return "sine=frequency=1320:duration=0.12,afade=t=out:st=0.02:d=0.1,volume=1.4";
  if (son === "ding") return "sine=frequency=1760:duration=0.6,afade=t=out:st=0.05:d=0.55,volume=0.9";
  return null;
}

// Monte la vidéo : une scène par phrase (média, effet, transition), sous-titres
// karaoké, emojis animés, sons d'effet, voix off et musique.
export async function monterMontage(plan: PlanMontage, medias: MediaScene[], d: number[], voix: Audio | null) {
  const dossier = await mkdtemp(path.join(tmpdir(), "montage-"));
  try {
    const polices = await dossierPolices();
    const scenes = plan.scenes;
    const n = scenes.length;
    const total = d.reduce((a, b) => a + b, 0);
    const debuts = debutsScenes(d);
    // Chaque scène dure un peu plus que sa phrase : la transition se fait
    // pendant ce surplus, la voix et les sous-titres restent calés.
    const T = scenes.map((s, i) => (i < n - 1 ? dureeTransition(s.transition) : 0));
    const longueurs = d.map((x, i) => Math.round((x + T[i]) * 100) / 100);

    await writeFile(path.join(dossier, "montage.ass"), sousTitresMontage(plan, d));
    const entrees: string[] = [];
    const filtres: string[] = [];
    for (const [i, s] of scenes.entries()) {
      const m = medias[i] ?? {};
      const len = longueurs[i];
      if (m.clip) {
        await writeFile(path.join(dossier, `s${i}.mp4`), m.clip);
        entrees.push("-stream_loop", "-1", "-t", String(len), "-i", `s${i}.mp4`);
      } else if (m.image) {
        const nom = `s${i}.${extensionImage(m.image)}`;
        await writeFile(path.join(dossier, nom), m.image);
        entrees.push("-framerate", String(IPS), "-loop", "1", "-t", String(len), "-i", nom);
      } else {
        entrees.push("-f", "lavfi", "-t", String(len), "-i", `color=c=0x1F2937:s=${L}x${H}:r=${IPS}`);
      }
      filtres.push(
        `[${i}:v]scale=${L}:${H}:force_original_aspect_ratio=increase,crop=${L}:${H},fps=${IPS},trim=duration=${len},setpts=PTS-STARTPTS` +
          `${filtreEffet(s, len, !m.clip)},setsar=1,format=yuv420p[v${i}]`,
      );
    }
    // Transitions : fondus, glissements, zooms ou coupes entre les scènes.
    let courant = "[v0]";
    for (let i = 0; i < n - 1; i++) {
      const sortie = `[x${i + 1}]`;
      const decalage = debuts[i] + d[i];
      filtres.push(`${courant}[v${i + 1}]xfade=transition=${XFADE[scenes[i].transition]}:duration=${T[i]}:offset=${decalage.toFixed(2)}${sortie}`);
      courant = sortie;
    }
    filtres.push(`${courant}subtitles=montage.ass:fontsdir=${polices}[sub]`);

    // Emojis : image Noto en surimpression pendant la scène, avec un rebond.
    let video = "[sub]";
    let entree = n;
    for (const [i, s] of scenes.entries()) {
      const fichier = fichierEmoji(s.emoji);
      if (!fichier) continue;
      const png = await telecharger(URL_EMOJIS + fichier, 2_000_000).catch(() => null);
      if (!png) continue;
      await writeFile(path.join(dossier, `e${i}.png`), png);
      entrees.push("-loop", "1", "-t", total.toFixed(2), "-i", `e${i}.png`);
      const a = debuts[i] + 0.1;
      const b = debuts[i] + d[i];
      filtres.push(`[${entree}:v]scale=180:180,format=rgba,fade=t=in:st=${a.toFixed(2)}:d=0.18:alpha=1[em${i}]`);
      filtres.push(`${video}[em${i}]overlay=x=(W-w)/2:y='420+12*sin(2*PI*t*1.6)':enable='between(t,${a.toFixed(2)},${b.toFixed(2)})'[ov${i}]`);
      video = `[ov${i}]`;
      entree++;
    }

    // Son : voix, musique et effets sonores (au début de chaque scène).
    const pistes: string[] = [];
    if (voix) {
      await writeFile(path.join(dossier, `voix.${voix.format}`), voix.donnees);
      if (voix.format === "pcm") entrees.push("-f", "s16le", "-ar", "24000", "-ac", "1");
      entrees.push("-i", `voix.${voix.format}`);
      filtres.push(`[${entree}:a]adelay=250:all=1,apad[voix]`);
      pistes.push("[voix]");
      entree++;
    }
    await writeFile(path.join(dossier, "fond.m4a"), Buffer.from(MUSIQUE_FOND_BASE64, "base64"));
    entrees.push("-stream_loop", "-1", "-i", "fond.m4a");
    filtres.push(`[${entree}:a]volume=${voix ? 0.16 : 0.45}[musique]`);
    pistes.push("[musique]");
    scenes.forEach((s, i) => {
      const src = sonEffet(s.son);
      if (!src) return;
      const t = Math.max(0, debuts[i] - (s.son === "whoosh" ? 0.15 : 0));
      filtres.push(`${src},adelay=${Math.round(t * 1000)}:all=1[son${i}]`);
      pistes.push(`[son${i}]`);
    });
    filtres.push(`${pistes.join("")}amix=inputs=${pistes.length}:duration=longest:normalize=0,alimiter=limit=0.95[audio]`);

    await executer(
      [
        ...entrees,
        "-filter_complex", filtres.join(";"),
        "-map", video, "-map", "[audio]",
        "-t", total.toFixed(2),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-r", String(IPS),
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
        "sortie.mp4",
      ],
      dossier,
    );
    return await readFile(path.join(dossier, "sortie.mp4"));
  } finally {
    await rm(dossier, { recursive: true, force: true });
  }
}
