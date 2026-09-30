import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { demanderIA } from "./ia.server";
import { assombrir } from "./couleurs";
import { cheminFfmpeg, dossierPolices, extensionImage } from "./video.server";
import { assVisuel, consigneTextesVisuel, lireTextesVisuel, textesDeSecours, type StyleTexte, type TextesVisuel } from "./visuel";

// Textes à incruster, écrits par l'IA ; sans réponse exploitable, tirés du
// post lui-même. Ne lève jamais d'erreur.
export async function textesVisuel(style: StyleTexte, t: { titre: string; brouillon: string }, contexte: string | null): Promise<TextesVisuel> {
  try {
    const r = lireTextesVisuel(
      await demanderIA(consigneTextesVisuel(style, t, contexte), {
        systeme: "Tu es directeur artistique pour les réseaux sociaux. Tu réponds uniquement en JSON valide.",
        maxTokens: 400,
        delaiTotal: 45_000,
      }),
    );
    if (r) return r;
  } catch (e) {
    console.warn("Textes du visuel : IA indisponible", e instanceof Error ? e.message : e);
  }
  return textesDeSecours(style, t, contexte);
}

function executer(args: string[], dossier: string) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cheminFfmpeg(), ["-hide_banner", "-loglevel", "error", "-y", ...args], { cwd: dossier });
    let erreurs = "";
    p.stderr.on("data", (d) => (erreurs += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code} : ${erreurs.slice(-500)}`))));
  });
}

// Compose l'image finale (JPEG) : le fond (photo recadrée, assombrie pour
// l'affiche promo ; dégradé aux couleurs de la marque pour la citation) et
// les textes mis en page.
export async function composerVisuel(
  style: StyleTexte,
  fond: Buffer | null,
  textes: TextesVisuel,
  [largeur, hauteur]: [number, number],
  accent: string,
  marque: string,
) {
  const dossier = await mkdtemp(path.join(tmpdir(), "visuel-"));
  try {
    const polices = await dossierPolices();
    await writeFile(path.join(dossier, "textes.ass"), assVisuel(style, textes, largeur, hauteur, accent, marque));
    const args: string[] = [];
    let filtre: string;
    if (fond && style !== "citation") {
      const nom = `fond.${extensionImage(fond)}`;
      await writeFile(path.join(dossier, nom), fond);
      args.push("-i", nom);
      filtre =
        `[0:v]scale=${largeur}:${hauteur}:force_original_aspect_ratio=increase,crop=${largeur}:${hauteur}` +
        (style === "promo" ? ",eq=brightness=-0.2:saturation=0.85,vignette=PI/4" : "");
    } else {
      const c0 = "0x0B1220";
      const c1 = assombrir(accent, 0.55).replace("#", "0x");
      filtre = `gradients=s=${largeur}x${hauteur}:c0=${c0}:c1=${c1}:x0=0:y0=0:x1=${largeur}:y1=${hauteur}:nb_colors=2:speed=0.00001:d=1`;
    }
    args.push("-filter_complex", `${filtre},subtitles=textes.ass:fontsdir=${polices},format=yuvj420p[v]`, "-map", "[v]", "-frames:v", "1", "-q:v", "3", "sortie.jpg");
    await executer(args, dossier);
    return await readFile(path.join(dossier, "sortie.jpg"));
  } finally {
    await rm(dossier, { recursive: true, force: true });
  }
}
