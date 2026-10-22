import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { demanderIA } from "./ia.server";
import { couleurDuSite } from "./site.server";
import { dossierPolices, executer } from "./video.server";
import { HAUTEUR_DIAPO, LARGEUR_DIAPO, consigneCarrousel, lireCarrousel, sansAccents, scriptCarrousel, titreDocument, type Carrousel } from "./carrousel";

// Fabrication d'un carrousel par le moteur : diapositives écrites par l'IA à
// partir du post, dessinées par ffmpeg (une image par diapositive, en une
// seule passe), réunies en PDF pour LinkedIn, puis déposées.

export type SujetCarrousel = { id: string; plateforme: string; titre: string; consigne: string; brouillon: string; marche?: string | null };

export type AtelierCarrousel = {
  journal: (niveau: string, message: string) => PromiseLike<unknown>;
  etat: (champs: Record<string, unknown>) => PromiseLike<unknown>;
  // Dépose un fichier (JPEG ou PDF) et renvoie son adresse publique.
  deposer: (fichier: Buffer, type: "image/jpeg" | "application/pdf", nom: string) => Promise<string>;
};

// Diapositives → JPEG 1080 × 1350 (une par seconde de la « vidéo » rendue).
export async function dessinerDiapos(c: Carrousel, options: { accent?: string; signature?: string | null } = {}) {
  const dossier = await mkdtemp(path.join(tmpdir(), "carrousel-"));
  try {
    await writeFile(path.join(dossier, "diapos.ass"), scriptCarrousel(c.diapos, options));
    const polices = await dossierPolices();
    await executer(
      [
        "-f", "lavfi",
        "-i", `color=c=0x0F172A:s=${LARGEUR_DIAPO}x${HAUTEUR_DIAPO}:r=1:d=${c.diapos.length}`,
        "-vf", `subtitles=diapos.ass:fontsdir=${polices}`,
        "-frames:v", String(c.diapos.length),
        "-q:v", "2",
        "diapo-%02d.jpg",
      ],
      dossier,
    );
    const noms = (await readdir(dossier)).filter((n) => n.startsWith("diapo-") && n.endsWith(".jpg")).sort();
    if (noms.length < c.diapos.length) throw new Error("diapositives incomplètes");
    return await Promise.all(noms.map((n) => readFile(path.join(dossier, n))));
  } finally {
    await rm(dossier, { recursive: true, force: true });
  }
}

// PDF minimal : une page par image JPEG (affichée telle quelle, sans
// recompression). LinkedIn en fait un document qu'on feuillette.
export function pdfDepuisJpeg(jpegs: Buffer[], largeur = LARGEUR_DIAPO, hauteur = HAUTEUR_DIAPO): Buffer {
  const morceaux: Buffer[] = [];
  const positions: number[] = [];
  let taille = 0;
  const ecrire = (b: Buffer | string) => {
    const buf = typeof b === "string" ? Buffer.from(b, "latin1") : b;
    morceaux.push(buf);
    taille += buf.length;
  };
  const objet = (n: number, corps: (Buffer | string)[]) => {
    positions[n] = taille;
    ecrire(`${n} 0 obj\n`);
    corps.forEach(ecrire);
    ecrire("\nendobj\n");
  };
  // Objets : 1 catalogue, 2 pages, puis par page : page, image, contenu.
  const n = jpegs.length;
  ecrire("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  objet(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
  const kids = jpegs.map((_, i) => `${3 + i * 3} 0 R`).join(" ");
  objet(2, [`<< /Type /Pages /Kids [${kids}] /Count ${n} >>`]);
  jpegs.forEach((jpeg, i) => {
    const page = 3 + i * 3;
    const image = page + 1;
    const contenu = page + 2;
    objet(page, [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${largeur} ${hauteur}] /Resources << /XObject << /Im${i} ${image} 0 R >> >> /Contents ${contenu} 0 R >>`,
    ]);
    objet(image, [
      `<< /Type /XObject /Subtype /Image /Width ${largeur} /Height ${hauteur} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
      jpeg,
      "\nendstream",
    ]);
    const dessin = `q ${largeur} 0 0 ${hauteur} 0 0 cm /Im${i} Do Q`;
    objet(contenu, [`<< /Length ${dessin.length} >>\nstream\n${dessin}\nendstream`]);
  });
  const xref = taille;
  const total = 3 + n * 3;
  ecrire(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let i = 1; i < total; i++) ecrire(`${String(positions[i]).padStart(10, "0")} 00000 n \n`);
  ecrire(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(morceaux);
}

export async function fabriquerCarrousel(t: SujetCarrousel, contexte: string | null, { journal, etat, deposer }: AtelierCarrousel) {
  const debut = Date.now();
  await etat({ carrousel_etat: "en_cours", carrousel_debut: new Date().toISOString() });
  await journal("action", `🎠 Création du carrousel pour « ${t.titre} »`);
  let c: Carrousel | null = null;
  for (let essai = 0; essai < 2 && !c && Date.now() - debut < 90_000; essai++) {
    try {
      c = lireCarrousel(
        await demanderIA(consigneCarrousel(t, contexte, t.marche), {
          systeme: "Tu es un expert des carrousels qui font enregistrer et partager. Tu réponds uniquement en JSON valide.",
          maxTokens: 2000,
          delaiTotal: Math.max(20_000, 90_000 - (Date.now() - debut)),
        }),
      );
      if (c && sansAccents(c.diapos.map((d) => `${d.titre} ${d.texte}`).join(" "), t.marche)) {
        await journal("info", `Carrousel, essai ${essai + 1} : texte sans accents, réécriture.`);
        c = null;
      }
    } catch (e) {
      await journal("info", `Carrousel, essai ${essai + 1} : ${e instanceof Error ? e.message.slice(0, 120) : "IA indisponible"}`);
    }
  }
  if (!c) throw new Error("diapositives non écrites (IA indisponible)");

  // Couleur du site de la marque pour les accents (jaune chantier par défaut).
  const site = contexte?.match(/Site \/ lien[^:]*: (\S+)/)?.[1];
  const accent = site ? await couleurDuSite(site).catch(() => null) : null;
  const jpegs = await dessinerDiapos(c, { accent: accent ?? undefined });
  const images: string[] = [];
  for (const [i, jpeg] of jpegs.entries()) images.push(await deposer(jpeg, "image/jpeg", `${t.id}-${Date.now()}-${String(i + 1).padStart(2, "0")}.jpg`));
  const titre = titreDocument(c);
  const pdf_url = t.plateforme === "linkedin" ? await deposer(pdfDepuisJpeg(jpegs), "application/pdf", `${t.id}-${Date.now()}.pdf`) : null;
  await etat({
    carrousel: { images, pdf_url, titre, diapos: c.diapos },
    // La couverture sert aussi d'image (aperçu, et secours si le carrousel
    // n'est pas accepté par le réseau).
    visuel_url: images[0],
    carrousel_etat: "pret",
  });
  await journal("info", `✅ Carrousel prêt : ${images.length} diapositives${pdf_url ? " (+ document PDF pour LinkedIn)" : ""}.`);
  return images;
}
