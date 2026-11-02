// Vidéos animées HyperFrames (accord de Younes du 02/11/2026) : la vidéo est
// une page web animée (GSAP) que le robot de rendu (GitHub Actions, dossier
// rendu-video/) filme image par image. Ce module écrit la page à partir du
// script de la vidéo : images qui zooment, écran du produit dans un téléphone,
// titres qui claquent, sous-titres mot par mot calés sur la voix, flash entre
// les scènes et barre de progression.

export type SceneAnimee = {
  texte_ecran: string;
  voix: string;
  duree: number;
  image: string; // nom du fichier dans le dossier de la vidéo
  produit: boolean; // capture de l'application : présentée dans un téléphone
  repere?: string;
};

export type PlanAnime = {
  scenes: SceneAnimee[];
  voix?: string | null; // fichier audio de la voix off
  musique?: string | null;
  marque: string;
  accent?: string | null;
  fin?: string | null; // phrase sous le nom de la marque, dernière scène
};

export const POLICES_ANIMEES = ["InterDisplay-SemiBold.otf", "InterDisplay-ExtraBold.otf"];

const echapper = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const r2 = (n: number) => Math.round(n * 100) / 100;
const couleurValide = (c: string | null | undefined) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : "#f28a1e");

// Sous-titres : paquets de 3 mots au plus, chacun avec son début et sa durée,
// répartis sur la scène selon la longueur des mots (≈ débit de la voix).
export function decouperSousTitres(voix: string, debut: number, duree: number) {
  const mots = voix.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!mots.length) return [];
  const poids = mots.map((m) => m.length + 2);
  const total = poids.reduce((a, b) => a + b, 0);
  const utile = Math.max(0.5, duree - 0.15);
  let t = debut + 0.05;
  const horaires = mots.map((m, i) => {
    const d = (poids[i] / total) * utile;
    const h = { mot: m, debut: r2(t), duree: r2(d) };
    t += d;
    return h;
  });
  const paquets: { mots: typeof horaires; debut: number; duree: number }[] = [];
  for (let i = 0; i < horaires.length; i += 3) {
    const groupe = horaires.slice(i, i + 3);
    const fin = i + 3 < horaires.length ? horaires[i + 3].debut : debut + duree;
    paquets.push({ mots: groupe, debut: groupe[0].debut, duree: r2(Math.max(0.2, fin - groupe[0].debut)) });
  }
  return paquets;
}

export function dureeTotale(plan: PlanAnime) {
  return r2(plan.scenes.reduce((a, s) => a + s.duree, 0));
}

export function compositionAnimee(plan: PlanAnime) {
  const accent = couleurValide(plan.accent);
  const total = dureeTotale(plan);
  const elements: string[] = [];
  const animations: string[] = [];
  let debut = 0;
  plan.scenes.forEach((s, i) => {
    const d = r2(s.duree);
    const t = r2(debut);
    const derniere = i === plan.scenes.length - 1;
    const sens = i % 2 ? -1 : 1;
    // Fond : l'image qui zoome lentement (Ken Burns), ou la capture floutée
    // derrière un téléphone qui flotte.
    if (s.produit) {
      elements.push(
        `<div id="fond-${i}" class="clip scene" data-start="${t}" data-duration="${d}"><img class="flou" src="${echapper(s.image)}" alt=""></div>`,
        `<div id="tel-${i}" class="clip telephone" data-start="${t}" data-duration="${d}"><img src="${echapper(s.image)}" alt=""></div>`,
      );
      animations.push(
        `tl.fromTo("#tel-${i}", { yPercent: 40, rotation: ${4 * sens}, opacity: 0 }, { yPercent: 0, rotation: 0, opacity: 1, duration: 0.6, ease: "back.out(1.3)" }, ${r2(t + 0.05)});`,
        `tl.to("#tel-${i}", { y: -24, duration: ${r2(Math.max(0.6, d - 0.7))}, ease: "sine.inOut" }, ${r2(t + 0.65)});`,
      );
    } else {
      elements.push(`<div id="fond-${i}" class="clip scene" data-start="${t}" data-duration="${d}"><img id="img-${i}" src="${echapper(s.image)}" alt=""></div>`);
      animations.push(
        `tl.fromTo("#img-${i}", { scale: 1.02, xPercent: ${-1.5 * sens} }, { scale: 1.12, xPercent: ${1.5 * sens}, duration: ${d}, ease: "none" }, ${t});`,
      );
    }
    // Flash et coup de zoom à chaque changement de scène.
    if (i > 0) {
      elements.push(`<div id="flash-${i}" class="clip flash" data-start="${r2(t - 0.06)}" data-duration="0.3"></div>`);
      animations.push(`tl.fromTo("#flash-${i}", { opacity: 0.85 }, { opacity: 0, duration: 0.28, ease: "power2.out" }, ${r2(t - 0.06)});`);
      animations.push(`tl.fromTo("#fond-${i}", { scale: 1.12 }, { scale: 1, duration: 0.35, ease: "power3.out" }, ${t});`);
    }
    // Titre de la scène : bandeau qui claque en haut (déjà visible à 0 s pour
    // la miniature des réseaux).
    if (s.texte_ecran) {
      const repere = s.repere ? `<span class="repere">${echapper(s.repere)}</span>` : "";
      elements.push(`<div id="titre-${i}" class="clip titre" data-start="${t}" data-duration="${d}">${repere}<span class="bandeau">${echapper(s.texte_ecran)}</span></div>`);
      animations.push(
        i === 0
          ? `tl.fromTo("#titre-${i}", { scale: 1.12 }, { scale: 1, duration: 0.45, ease: "power3.out" }, 0);`
          : `tl.fromTo("#titre-${i}", { scale: 0.6, opacity: 0, rotation: ${-3 * sens} }, { scale: 1, opacity: 1, rotation: 0, duration: 0.42, ease: "back.out(2)" }, ${r2(t + 0.08)});`,
      );
    }
    // Sous-titres mot par mot : le mot prononcé passe en couleur.
    decouperSousTitres(s.voix, t, d).forEach((p, j) => {
      const id = `st-${i}-${j}`;
      const mots = p.mots.map((m, k) => `<span id="${id}-${k}" class="mot">${echapper(m.mot)}</span>`).join(" ");
      elements.push(`<div id="${id}" class="clip sous-titre${s.produit ? " bas" : ""}" data-start="${p.debut}" data-duration="${p.duree}">${mots}</div>`);
      animations.push(`tl.fromTo("#${id}", { scale: 0.85, y: 20 }, { scale: 1, y: 0, duration: 0.16, ease: "back.out(2.5)" }, ${p.debut});`);
      p.mots.forEach((m, k) =>
        animations.push(`tl.fromTo("#${id}-${k}", { color: "#ffffff" }, { color: "${accent}", scale: 1.08, duration: 0.08, ease: "power1.out" }, ${m.debut});`, `tl.to("#${id}-${k}", { scale: 1, duration: 0.12 }, ${r2(m.debut + 0.1)});`),
      );
    });
    if (derniere) {
      const fin = plan.fin ? `<div class="baseline">${echapper(plan.fin)}</div>` : "";
      elements.push(`<div id="marque" class="clip marque" data-start="${t}" data-duration="${d}"><div class="nom">${echapper(plan.marque)}</div>${fin}</div>`);
      animations.push(`tl.fromTo("#marque", { y: 80, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, ${r2(t + 0.3)});`);
    }
    debut += s.duree;
  });
  elements.push(`<div id="progression" class="clip progression" data-start="0" data-duration="${total}"></div>`);
  animations.push(`tl.fromTo("#progression", { scaleX: 0 }, { scaleX: 1, duration: ${total}, ease: "none" }, 0);`);
  if (plan.voix) elements.push(`<audio id="voix" src="${echapper(plan.voix)}" data-start="0" data-duration="${total}" data-volume="1"></audio>`);
  if (plan.musique)
    elements.push(`<audio id="musique" src="${echapper(plan.musique)}" data-start="0" data-duration="${total}" data-volume="${plan.voix ? 0.16 : 0.5}" data-fade-in="0.3" data-fade-out="1"></audio>`);

  return `<!doctype html>
<html lang="fr" data-resolution="portrait">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=1080, height=1920" />
<script src="gsap.min.js"></script>
<style>
@font-face { font-family: "Inter Display"; src: url("InterDisplay-SemiBold.otf"); font-weight: 600; }
@font-face { font-family: "Inter Display"; src: url("InterDisplay-ExtraBold.otf"); font-weight: 800; }
:root { --accent: ${accent}; --nuit: #0d1320; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 1080px; height: 1920px; overflow: hidden; background: var(--nuit); }
#root { position: relative; width: 100%; height: 100%; font-family: "Inter Display", sans-serif; color: #fff; overflow: hidden; }
.clip { position: absolute; }
.scene { inset: 0; overflow: hidden; }
.scene img { width: 100%; height: 100%; object-fit: cover; }
.scene::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(13,19,32,.55) 0%, rgba(13,19,32,0) 28%, rgba(13,19,32,0) 55%, rgba(13,19,32,.85) 100%); }
.scene .flou { filter: blur(40px) brightness(.55); transform: scale(1.2); }
.telephone { left: 215px; top: 390px; width: 650px; height: 1200px; border-radius: 70px; border: 16px solid #10151f; background: #10151f; overflow: hidden; box-shadow: 0 60px 120px rgba(0,0,0,.6), 0 0 0 4px rgba(255,255,255,.08); }
.telephone img { width: 100%; height: 100%; object-fit: cover; object-position: top; }
.flash { inset: 0; background: #fff; opacity: 0; }
.titre { left: 60px; right: 60px; top: 170px; display: flex; flex-direction: column; align-items: center; gap: 22px; text-align: center; }
.bandeau { display: inline-block; background: #fff; color: #0d1320; font-weight: 800; font-size: 76px; line-height: 1.06; letter-spacing: -0.03em; padding: 18px 34px 22px; border-radius: 22px; box-shadow: 0 18px 40px rgba(0,0,0,.35); }
.repere { display: inline-block; background: var(--accent); color: #0d1320; font-weight: 800; font-size: 46px; padding: 8px 26px; border-radius: 14px; }
.sous-titre { left: 50px; right: 50px; top: 1330px; text-align: center; font-weight: 800; font-size: 92px; line-height: 1.08; letter-spacing: -0.02em; -webkit-text-stroke: 9px #0d1320; paint-order: stroke fill; text-shadow: 0 8px 24px rgba(0,0,0,.6); }
.sous-titre.bas { top: 1650px; font-size: 80px; }
.mot { display: inline-block; margin: 0 0.14em; }
.marque { left: 0; right: 0; bottom: 120px; text-align: center; }
.marque .nom { display: inline-block; background: var(--accent); color: #0d1320; font-weight: 800; font-size: 70px; padding: 14px 40px; border-radius: 20px; letter-spacing: -0.02em; }
.marque .baseline { margin-top: 18px; font-weight: 600; font-size: 40px; color: #fff; text-shadow: 0 3px 12px rgba(0,0,0,.7); }
.progression { left: 0; top: 0; width: 1080px; height: 12px; background: var(--accent); transform-origin: left center; }
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="1080" data-height="1920">
${elements.join("\n")}
</div>
<script>
window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
${animations.join("\n")}
window.__timelines["main"] = tl;
tl.seek(0);
</script>
</body>
</html>
`;
}
