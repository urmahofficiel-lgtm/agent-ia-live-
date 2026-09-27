import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpeg from "ffmpeg-static";
import { POLICE_SOUS_TITRES_BASE64 } from "./generes/police.server";
import { sousTitresAss } from "./video";

export const LARGEUR = 720;
export const HAUTEUR = 1280;
const IMAGES_PAR_SECONDE = 30;

export const cheminFfmpeg = () => ffmpeg as unknown as string;

function executer(args: string[], dossier: string) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cheminFfmpeg(), ["-hide_banner", "-loglevel", "error", "-y", ...args], { cwd: dossier });
    let erreurs = "";
    p.stderr.on("data", (d) => (erreurs += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code} : ${erreurs.slice(-500)}`))));
  });
}

async function dossierPolices() {
  const dossier = path.join(tmpdir(), "polices-agent");
  const fichier = path.join(dossier, "DejaVuSans-Bold.ttf");
  if (!existsSync(fichier)) {
    await mkdir(dossier, { recursive: true });
    await writeFile(fichier, Buffer.from(POLICE_SOUS_TITRES_BASE64, "base64"));
  }
  return dossier;
}

export type SceneMontage = { image: Buffer; texte_ecran: string };

// Monte la vidéo : chaque image s'anime (zoom lent, type « Ken Burns »), les
// textes s'affichent en sous-titres stylés, la voix off est ajoutée si fournie.
export async function monterVideo(scenes: SceneMontage[], d: number[], voix?: { donnees: Buffer; format: "wav" | "pcm" }) {
  const dossier = await mkdtemp(path.join(tmpdir(), "video-"));
  try {
    const polices = await dossierPolices();
    await Promise.all(scenes.map((s, i) => writeFile(path.join(dossier, `s${i}.jpg`), s.image)));
    await writeFile(path.join(dossier, "textes.ass"), sousTitresAss(scenes, d, LARGEUR, HAUTEUR));

    const entrees: string[] = [];
    const filtres: string[] = [];
    scenes.forEach((_, i) => {
      entrees.push("-loop", "1", "-t", String(d[i]), "-i", `s${i}.jpg`);
      const images = Math.ceil(d[i] * IMAGES_PAR_SECONDE);
      // Zoom avant ou arrière en alternance, pour du mouvement.
      const zoom = i % 2 === 0 ? "min(1+0.12*on/" + images + ",1.12)" : "max(1.12-0.12*on/" + images + ",1)";
      filtres.push(
        `[${i}:v]scale=${LARGEUR * 2}:${HAUTEUR * 2}:force_original_aspect_ratio=increase,crop=${LARGEUR * 2}:${HAUTEUR * 2},` +
          `zoompan=z='${zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${images}:s=${LARGEUR}x${HAUTEUR}:fps=${IMAGES_PAR_SECONDE},setsar=1[v${i}]`,
      );
    });
    const fondu = scenes.map((_, i) => `[v${i}]`).join("");
    filtres.push(`${fondu}concat=n=${scenes.length}:v=1:a=0[brut]`);
    filtres.push(`[brut]subtitles=textes.ass:fontsdir=${polices}[video]`);

    const args = [...entrees];
    const duree = d.reduce((a, b) => a + b, 0);
    if (voix) {
      await writeFile(path.join(dossier, `voix.${voix.format}`), voix.donnees);
      if (voix.format === "pcm") args.push("-f", "s16le", "-ar", "24000", "-ac", "1");
      args.push("-i", `voix.${voix.format}`);
    }
    args.push("-filter_complex", filtres.join(";"), "-map", "[video]");
    if (voix) args.push("-map", `${scenes.length}:a`, "-c:a", "aac", "-b:a", "128k", "-af", "apad");
    args.push(
      "-t", duree.toFixed(2),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-pix_fmt", "yuv420p",
      "-r", String(IMAGES_PAR_SECONDE), "-movflags", "+faststart",
      "sortie.mp4",
    );
    await executer(args, dossier);
    return await readFile(path.join(dossier, "sortie.mp4"));
  } finally {
    await rm(dossier, { recursive: true, force: true });
  }
}
