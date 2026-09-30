import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpeg from "ffmpeg-static";
import { POLICE_SOUS_TITRES_BASE64 } from "./generes/police.server";
import { coupesSaccadees, indexTransition, sousTitresStyle } from "./video";
import type { StyleVideo } from "./styles";

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

// Dossier de la police embarquée (écrite une fois dans /tmp), pour libass.
export async function dossierPolices() {
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
// `voix` : texte parlé (sous-titres mot à mot) ; `repere` : numéro, AVANT…
export type SceneMontage = { image?: Buffer; clip?: Buffer; cadre?: boolean; texte_ecran: string; voix?: string; repere?: string };

// Réglages du montage selon le style ; `accent` : couleur de la marque.
export type OptionsMontage = { style?: StyleVideo; accent?: string };

// Durée du fondu « avant → après » (balayage).
const TRANSITION = 0.5;

// Zone réservée à l'image cadrée : au-dessus des textes à l'écran.
const CADRE = { largeur: 620, hauteur: 700, haut: 110 };

// Monte la vidéo : chaque image s'anime (zoom lent, type « Ken Burns »), les
// textes s'affichent en sous-titres stylés, la voix off est ajoutée si fournie.
export async function monterVideo(
  scenes: SceneMontage[],
  d: number[],
  voix?: { donnees: Buffer; format: "wav" | "pcm" },
  { style = "classique", accent }: OptionsMontage = {},
) {
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
    await writeFile(path.join(dossier, "textes.ass"), sousTitresStyle(style, scenes, d, LARGEUR, HAUTEUR, accent));
    // Avant / après : la dernière scène « AVANT » dure un peu plus, le temps
    // du balayage vers la scène « APRÈS » (la frise totale ne change pas).
    const bascule = style === "avant_apres" ? indexTransition(scenes.map((s) => s.repere ?? "")) : -1;
    const rendu = d.map((x, i) => (i === bascule - 1 ? Math.round((x + TRANSITION) * 100) / 100 : x));

    const entrees: string[] = [];
    const filtres: string[] = [];
    scenes.forEach((s, i) => {
      if (s.clip) {
        // Séquence réelle : recadrée en vertical, bouclée si trop courte.
        entrees.push("-stream_loop", "-1", "-t", String(rendu[i]), "-i", `s${i}.mp4`);
        filtres.push(
          `[${i}:v]scale=${LARGEUR}:${HAUTEUR}:force_original_aspect_ratio=increase,crop=${LARGEUR}:${HAUTEUR},` +
            `fps=${IMAGES_PAR_SECONDE},trim=duration=${rendu[i]},setpts=PTS-STARTPTS,setsar=1[v${i}]`,
        );
        return;
      }
      if (s.cadre) {
        entrees.push("-loop", "1", "-t", String(rendu[i]), "-i", `s${i}.${extensionImage(s.image)}`);
        // Fond : l'image elle-même, agrandie, floutée et assombrie. Devant :
        // l'image entière, qui remonte lentement pour donner du mouvement.
        filtres.push(
          `[${i}:v]split[f${i}][p${i}];` +
            `[f${i}]scale=${LARGEUR}:${HAUTEUR}:force_original_aspect_ratio=increase,crop=${LARGEUR}:${HAUTEUR},boxblur=24:3,eq=brightness=-0.22[fond${i}];` +
            `[p${i}]scale=${CADRE.largeur}:${CADRE.hauteur}:force_original_aspect_ratio=decrease[av${i}];` +
            `[fond${i}][av${i}]overlay=x=(W-w)/2:y=${CADRE.haut}+(${CADRE.hauteur}-h)/2+18-t*${(36 / rendu[i]).toFixed(2)}:shortest=1,` +
            `fps=${IMAGES_PAR_SECONDE},trim=duration=${rendu[i]},setpts=PTS-STARTPTS,setsar=1[v${i}]`,
        );
        return;
      }
      // Une seule image en entrée : zoompan en fabrique lui-même `images`
      // (en boucle, chaque image d'entrée en produirait autant).
      entrees.push("-i", `s${i}.${extensionImage(s.image)}`);
      const images = Math.ceil(rendu[i] * IMAGES_PAR_SECONDE);
      // Zoom avant ou arrière en alternance, pour du mouvement.
      const zoom = i % 2 === 0 ? "min(1+0.12*on/" + images + ",1.12)" : "max(1.12-0.12*on/" + images + ",1)";
      filtres.push(
        `[${i}:v]scale=${LARGEUR * 2}:${HAUTEUR * 2}:force_original_aspect_ratio=increase,crop=${LARGEUR * 2}:${HAUTEUR * 2},` +
          `zoompan=z='${zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${images}:s=${LARGEUR}x${HAUTEUR}:fps=${IMAGES_PAR_SECONDE},trim=duration=${rendu[i]},setpts=PTS-STARTPTS,setsar=1[v${i}]`,
      );
    });
    // Teinte selon le style : l'« avant » est terne, l'« après » éclatant.
    const segments = scenes.map((s, i) => {
      if (style !== "avant_apres" || !s.repere) return `[v${i}]`;
      filtres.push(`[v${i}]eq=${s.repere === "AVANT" ? "saturation=0.35:contrast=0.92:brightness=-0.04" : "saturation=1.25:contrast=1.06"}[t${i}]`);
      return `[t${i}]`;
    });
    if (style === "ugc") {
      // Jump cuts : chaque scène est découpée en plans courts, recadrés
      // alternativement plus ou moins serrés.
      const plans: string[] = [];
      segments.forEach((seg, i) => {
        const coupes = coupesSaccadees(rendu[i]);
        filtres.push(`${seg}split=${coupes.length}${coupes.map((_, k) => `[p${i}_${k}]`).join("")}`);
        coupes.forEach(([a, b], k) => {
          const z = [1, 1.16, 1.07, 1.22][(i + k) % 4];
          const x = ["(iw-ow)/2", "(iw-ow)*0.3", "(iw-ow)*0.7", "(iw-ow)/2"][(i + 2 * k) % 4];
          filtres.push(
            `[p${i}_${k}]trim=start=${a}:end=${b},setpts=PTS-STARTPTS,crop=iw/${z}:ih/${z}:${x}:(ih-oh)/2,scale=${LARGEUR}:${HAUTEUR},setsar=1[c${i}_${k}]`,
          );
          plans.push(`[c${i}_${k}]`);
        });
      });
      filtres.push(`${plans.join("")}concat=n=${plans.length}:v=1:a=0[plans]`);
      // Petit tremblement « caméra à la main ».
      filtres.push(
        `[plans]crop=${LARGEUR - 36}:${HAUTEUR - 36}:x='18+9*sin(2*PI*t*1.3)+4*sin(2*PI*t*3.7)':y='18+9*sin(2*PI*t*1.1+1)+4*sin(2*PI*t*4.3)',scale=${LARGEUR}:${HAUTEUR},setsar=1[brut]`,
      );
    } else if (bascule > 0) {
      const avant = segments.slice(0, bascule);
      const apres = segments.slice(bascule);
      const debutBascule = d.slice(0, bascule).reduce((a, b) => a + b, 0);
      filtres.push(`${avant.join("")}concat=n=${avant.length}:v=1:a=0,fps=${IMAGES_PAR_SECONDE},format=yuv420p[avant]`);
      filtres.push(`${apres.join("")}concat=n=${apres.length}:v=1:a=0,fps=${IMAGES_PAR_SECONDE},format=yuv420p[apres]`);
      filtres.push(`[avant][apres]xfade=transition=wiperight:duration=${TRANSITION}:offset=${debutBascule.toFixed(2)}[brut]`);
    } else {
      filtres.push(`${segments.join("")}concat=n=${scenes.length}:v=1:a=0[brut]`);
    }
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
