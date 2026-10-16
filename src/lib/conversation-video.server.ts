import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MUSIQUE_FOND_BASE64 } from "./generes/musique.server";
import { cheminFfmpeg, dossierPolices } from "./video.server";
import { ECRAN, instantsSons, minutage, sousTitresConversation, type ScriptConversation } from "./conversation-video";

function executer(args: string[], dossier: string) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cheminFfmpeg(), ["-hide_banner", "-loglevel", "error", "-y", ...args], { cwd: dossier });
    let erreurs = "";
    p.stderr.on("data", (d) => (erreurs += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code} : ${erreurs.slice(-500)}`))));
  });
}

// Monte la vidéo « conversation » : décor et bulles dessinés par libass sur un
// fond uni, musique de fond douce et un « pop » de notification par message.
export async function monterConversation(s: ScriptConversation): Promise<Buffer> {
  const dossier = await mkdtemp(path.join(tmpdir(), "conversation-"));
  try {
    const polices = await dossierPolices();
    const { total } = minutage(s.messages);
    await writeFile(path.join(dossier, "conversation.ass"), sousTitresConversation(s));
    await writeFile(path.join(dossier, "fond.m4a"), Buffer.from(MUSIQUE_FOND_BASE64, "base64"));

    const pops = instantsSons(s);
    const n = pops.length;
    const sons = [
      // Pop court : une note aiguë qui s'éteint vite.
      `sine=frequency=1320:duration=0.12,volume=1.6,afade=t=out:st=0.02:d=0.1,asplit=${n}${pops.map((_, i) => `[p${i}]`).join("")}`,
      ...pops.map((t, i) => `[p${i}]adelay=${Math.round(t * 1000)}:all=1[q${i}]`),
      `[1:a]volume=0.5[m]`,
      `[m]${pops.map((_, i) => `[q${i}]`).join("")}amix=inputs=${n + 1}:duration=first:normalize=0,alimiter=limit=0.9[a]`,
    ];
    await executer(
      [
        "-f", "lavfi", "-i", `color=c=0xECE5DD:s=${ECRAN.largeur}x${ECRAN.hauteur}:r=30:d=${total.toFixed(2)}`,
        "-stream_loop", "-1", "-i", "fond.m4a",
        "-filter_complex", [`[0:v]subtitles=conversation.ass:fontsdir=${polices}[v]`, ...sons].join(";"),
        "-map", "[v]", "-map", "[a]",
        "-t", total.toFixed(2),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
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
