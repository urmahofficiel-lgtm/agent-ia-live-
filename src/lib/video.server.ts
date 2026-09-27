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

// ffmpeg choisit le décodeur d'image d'après l'extension : elle doit
// correspondre au contenu (les captures des sites sont souvent en PNG).
export function extensionImage(image?: Buffer) {
  if (!image || image.length < 12) return "jpg";
  if (image.readUInt32BE(0) === 0x89504e47) return "png";
  if (image.toString("ascii", 0, 4) === "RIFF" && image.toString("ascii", 8, 12) === "WEBP") return "webp";
  return "jpg";
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

// Une scène = une image (animée par zoom) ou une vraie séquence vidéo.
// `cadre` : image montrée en entier (capture du produit, logo) sur un fond
// flouté tiré d'elle-même, au lieu d'être recadrée plein écran.
export type SceneMontage = { image?: Buffer; clip?: Buffer; cadre?: boolean; texte_ecran: string };

// Zone réservée à l'image cadrée : au-dessus des textes à l'écran.
const CADRE = { largeur: 620, hauteur: 700, haut: 110 };

// Monte la vidéo : chaque image s'anime (zoom lent, type « Ken Burns »), les
// textes s'affichent en sous-titres stylés, la voix off est ajoutée si fournie.
export async function monterVideo(scenes: SceneMontage[], d: number[], voix?: { donnees: Buffer; format: "wav" | "pcm" }) {
  const dossier = await mkdtemp(path.join(tmpdir(), "video-"));
  try {
    const polices = await dossierPolices();
    await Promise.all(
      scenes.map((s, i) =>
        s.clip
          ? writeFile(path.join(dossier, `s${i}.mp4`), s.clip)
          : writeFile(path.join(dossier, `s${i}.${extensionImage(s.image)}`), s.image ?? Buffer.alloc(0)),
      ),
    );
    await writeFile(path.join(dossier, "textes.ass"), sousTitresAss(scenes, d, LARGEUR, HAUTEUR));

    const entrees: string[] = [];
    const filtres: string[] = [];
    scenes.forEach((s, i) => {
      if (s.clip) {
        // Séquence réelle : recadrée en vertical, bouclée si trop courte.
        entrees.push("-stream_loop", "-1", "-t", String(d[i]), "-i", `s${i}.mp4`);
        filtres.push(
          `[${i}:v]scale=${LARGEUR}:${HAUTEUR}:force_original_aspect_ratio=increase,crop=${LARGEUR}:${HAUTEUR},` +
            `fps=${IMAGES_PAR_SECONDE},trim=duration=${d[i]},setpts=PTS-STARTPTS,setsar=1[v${i}]`,
        );
        return;
      }
      if (s.cadre) {
        entrees.push("-loop", "1", "-t", String(d[i]), "-i", `s${i}.${extensionImage(s.image)}`);
        // Fond : l'image elle-même, agrandie, floutée et assombrie. Devant :
        // l'image entière, qui remonte lentement pour donner du mouvement.
        filtres.push(
          `[${i}:v]split[f${i}][p${i}];` +
            `[f${i}]scale=${LARGEUR}:${HAUTEUR}:force_original_aspect_ratio=increase,crop=${LARGEUR}:${HAUTEUR},boxblur=24:3,eq=brightness=-0.22[fond${i}];` +
            `[p${i}]scale=${CADRE.largeur}:${CADRE.hauteur}:force_original_aspect_ratio=decrease[av${i}];` +
            `[fond${i}][av${i}]overlay=x=(W-w)/2:y=${CADRE.haut}+(${CADRE.hauteur}-h)/2+18-t*${(36 / d[i]).toFixed(2)}:shortest=1,` +
            `fps=${IMAGES_PAR_SECONDE},trim=duration=${d[i]},setpts=PTS-STARTPTS,setsar=1[v${i}]`,
        );
        return;
      }
      // Une seule image en entrée : zoompan en fabrique lui-même `images`
      // (en boucle, chaque image d'entrée en produirait autant).
      entrees.push("-i", `s${i}.${extensionImage(s.image)}`);
      const images = Math.ceil(d[i] * IMAGES_PAR_SECONDE);
      // Zoom avant ou arrière en alternance, pour du mouvement.
      const zoom = i % 2 === 0 ? "min(1+0.12*on/" + images + ",1.12)" : "max(1.12-0.12*on/" + images + ",1)";
      filtres.push(
        `[${i}:v]scale=${LARGEUR * 2}:${HAUTEUR * 2}:force_original_aspect_ratio=increase,crop=${LARGEUR * 2}:${HAUTEUR * 2},` +
          `zoompan=z='${zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${images}:s=${LARGEUR}x${HAUTEUR}:fps=${IMAGES_PAR_SECONDE},trim=duration=${d[i]},setpts=PTS-STARTPTS,setsar=1[v${i}]`,
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
