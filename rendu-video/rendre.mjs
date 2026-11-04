// Robot de rendu des vidéos animées HyperFrames (accord de Younes du
// 02/11/2026). Lancé par GitHub Actions (.github/workflows/rendu-video.yml) :
// prend les vidéos « a_rendre » préparées par le moteur, écrit leur page
// animée (src/lib/hyperframes.ts), la filme avec HyperFrames et dépose le MP4.
// Aucun message n'est envoyé à personne : seule la tâche est mise à jour.
//
//   node --experimental-strip-types rendu-video/rendre.mjs           rend la file
//   node --experimental-strip-types rendu-video/rendre.mjs --compter écrit a_rendre=<n> (GitHub)
import { spawnSync } from "node:child_process";
import { appendFileSync, copyFileSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compositionAnimee, dureeTotale } from "../src/lib/hyperframes.ts";
import { compositionExplication, dureeExplication } from "../src/lib/explication.ts";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const URL_SB = process.env.SUPABASE_URL || "https://idabdhnsciymoauyogmj.supabase.co";
const CLE = process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_VvarkoTJdJPMo9CIdSuZOw_o6p_kiff";
// Clé propre au robot (secret GitHub RENDU_VIDEO_CLE), limitée à sa file.
const CLE_ROBOT = process.env.RENDU_VIDEO_CLE ?? "";
const HYPERFRAMES = "hyperframes@0.9.5";
const entetes = { apikey: CLE, Authorization: `Bearer ${CLE}` };

async function rpc(nom, corps) {
  const r = await fetch(`${URL_SB}/rest/v1/rpc/${nom}`, {
    method: "POST",
    headers: { ...entetes, "Content-Type": "application/json" },
    body: JSON.stringify({ p_cle: CLE_ROBOT, ...corps }),
  });
  const texte = await r.text();
  if (!r.ok) throw new Error(`${nom} : ${r.status} ${texte.slice(0, 200)}`);
  return texte ? JSON.parse(texte) : null;
}

const fini = (tache, url, erreur, message) => rpc("robot_rendu_fini", { p_tache: tache, p_url: url, p_erreur: erreur, p_message: message });

async function telecharger(url, fichier) {
  const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`Fichier ${path.basename(fichier)} introuvable (${r.status}).`);
  writeFileSync(fichier, Buffer.from(await r.arrayBuffer()));
}

async function rendre(t) {
  const { base, fichiers, plan } = t.rendu ?? {};
  const explication = plan?.kind === "explication";
  if (!base || !Array.isArray(fichiers) || !(explication ? plan?.plans?.length : plan?.scenes?.length)) throw new Error("Plan de la vidéo incomplet.");
  const dossier = mkdtempSync(path.join(tmpdir(), "anime-"));
  try {
    // Seuls des noms simples (s0.jpg, voix.wav…) : jamais de chemin.
    for (const nom of fichiers) {
      if (!/^[\w.-]+$/.test(nom)) throw new Error(`Nom de fichier refusé : ${nom}`);
      await telecharger(`${base}/${nom}`, path.join(dossier, nom));
    }
    for (const nom of ["gsap.min.js", "InterDisplay-SemiBold.otf", "InterDisplay-ExtraBold.otf", "Anton-Regular.woff2"]) copyFileSync(path.join(ICI, nom), path.join(dossier, nom));
    writeFileSync(path.join(dossier, "index.html"), explication ? compositionExplication(plan) : compositionAnimee(plan));
    writeFileSync(path.join(dossier, "package.json"), JSON.stringify({ name: "anime", private: true, type: "module" }));
    const sortie = path.join(dossier, "video.mp4");
    const r = spawnSync("npx", ["--yes", HYPERFRAMES, "render", dossier, "-o", sortie, "--quiet"], { encoding: "utf8", timeout: 15 * 60_000 });
    if (r.status !== 0) throw new Error(`Rendu HyperFrames en échec : ${(r.stderr || r.stdout || "").slice(-400)}`);
    const mp4 = readFileSync(sortie);
    // Dépôt avec un ticket à usage unique, comme le moteur.
    const ticket = await rpc("robot_rendu_depot", { p_tache: t.tache_id });
    const chemin = `${t.user_id}/auto-${ticket}/${t.tache_id}-${Date.now()}.mp4`;
    const d = await fetch(`${URL_SB}/storage/v1/object/videos/${chemin}`, {
      method: "POST",
      headers: { ...entetes, "Content-Type": "video/mp4" },
      body: mp4,
    });
    if (!d.ok) throw new Error(`Dépôt du MP4 refusé : ${d.status} ${(await d.text()).slice(0, 200)}`);
    const video_url = `${URL_SB}/storage/v1/object/public/videos/${chemin}`;
    await fini(
      t.tache_id,
      video_url,
      null,
      `✅ Vidéo ${explication ? "« Explication »" : "animée"} prête (${Math.round(explication ? dureeExplication(plan) : dureeTotale(plan))} s, ${(statSync(sortie).size / 1e6).toFixed(1)} Mo).`,
    );
    console.log("rendue", t.tache_id, video_url);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

if (!CLE_ROBOT) {
  console.error("RENDU_VIDEO_CLE manquant (secret du dépôt GitHub).");
  process.exit(1);
}
const file = (await rpc("robot_rendus_a_faire", {})) ?? [];
if (process.argv.includes("--compter")) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `a_rendre=${file.length}\n`);
  console.log(`${file.length} vidéo(s) à rendre`);
  process.exit(0);
}
for (const t of file) {
  try {
    await rendre(t);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    console.error("échec", t.tache_id, m);
    // Retour en file du moteur : montage classique au prochain passage.
    await fini(t.tache_id, null, m.slice(0, 300), `Vidéo animée non rendue (${m.slice(0, 120)}) : montage classique au prochain passage.`).catch(() => {});
  }
}
