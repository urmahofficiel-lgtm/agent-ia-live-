// Vidéo « Histoire » en papier découpé (HyperFrames) : fond kraft, coupures de
// journal, icônes en autocollants à bordure blanche, mouvement saccadé à 12
// images par seconde (effet stop-motion). Le sujet est une histoire vraie du
// monde de la construction ; la marque n'apparaît que sur la dernière image.
// Même contrat que explication.ts : une page animée (GSAP) que le robot de
// rendu (rendu-video/rendre.mjs) filme.
import { ICONES_DECOUPE } from "./decoupe-icones.ts";

export type CarteFinale = { grand: string; petits: string[]; site: string };

export type PlanDecoupe = {
  titre: string; // titre du journal, MAJUSCULES ; le dernier mot est surligné
  extrait: string; // petit texte de la coupure
  phrase: string; // phrase dite par la voix ; le mot clé entre *astérisques*
  icones: [string, string?]; // noms dans ICONES_DECOUPE
  duree: number;
  carte?: CarteFinale; // dernier plan seulement : la seule mention de la marque
};

export type Decoupe = {
  plans: PlanDecoupe[];
  rubrique?: string | null; // petit titre au-dessus du journal
  voix?: string | null;
  musique?: string | null;
};

export const POLICES_DECOUPE = ["Anton-Regular.woff2", "InterDisplay-SemiBold.otf", "InterDisplay-ExtraBold.otf"];
export const IMAGES_PAR_SECONDE = 12;

const ech = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const r2 = (n: number) => Math.round(n * 100) / 100;
export const dureeDecoupe = (d: Decoupe) => r2(d.plans.reduce((s, p) => s + p.duree, 0));

// Graine fixe : le rendu est identique à chaque fois.
function graine(n: number) {
  let a = (n + 1) * 2654435761;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Papier déchiré : polygone aux bords irréguliers.
function dechire(rnd: () => number, n = 24, amp = 1.5) {
  const pts: string[] = [];
  const cote = (fx: number, fy: number, tx: number, ty: number) => {
    for (let i = 0; i < n; i++) {
      const t = i / n;
      pts.push(`${r2(fx + (tx - fx) * t + (rnd() - 0.5) * amp)}% ${r2(fy + (ty - fy) * t + (rnd() - 0.5) * amp)}%`);
    }
  };
  cote(0, 0, 100, 0);
  cote(100, 0, 100, 100);
  cote(100, 100, 0, 100);
  cote(0, 100, 0, 0);
  return `polygon(${pts.join(",")})`;
}

const icone = (nom: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="#141414" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${ICONES_DECOUPE[nom] ?? ICONES_DECOUPE.Landmark}</svg>`;
const POP = [0.45, 0.85, 1.12, 1.04];

// Mouvement « stop-motion » : une pose par image à 12 i/s, qui tremble un peu,
// avec une entrée par paliers (petit, grand, dépasse, se pose).
function boil(anim: string[], sel: string, t0: number, d: number, x: number, y: number, rot: number, amp: { p: number; r: number }, retard: number, rnd: () => number) {
  const n = Math.max(1, Math.round(d * IMAGES_PAR_SECONDE));
  for (let k = 0; k < n; k++) {
    const t = r2(t0 + k / IMAGES_PAR_SECONDE);
    const e = k * 1 < retard * IMAGES_PAR_SECONDE ? 0 : POP[k - Math.round(retard * IMAGES_PAR_SECONDE)] ?? 1;
    const j = () => (rnd() - 0.5) * 2;
    anim.push(`tl.set("${sel}", { x: ${r2(x + j() * amp.p)}, y: ${r2(y + j() * amp.p)}, rotation: ${r2(rot + j() * amp.r)}, scale: ${e} }, ${t});`);
  }
}

function surligner(titre: string) {
  const mots = titre.trim().split(/\s+/);
  const dernier = mots.pop() ?? "";
  return `${ech(mots.join(" "))}${mots.length ? " " : ""}<mark>${ech(dernier)}</mark>`;
}
const motsCles = (t: string) => ech(t).replace(/\*([^*]+)\*/g, '<span class="cle">$1</span>');

export function compositionDecoupe(e: Decoupe): string {
  const total = dureeDecoupe(e);
  const el: string[] = [];
  const anim: string[] = [];
  let t = 0;
  e.plans.forEach((p, i) => {
    const d = p.duree;
    const deb = r2(t);
    const rnd = graine(i * 7 + 3);
    const id = `p${i}`;
    const a1 = (rnd() - 0.5) * 5;
    if (p.carte) {
      el.push(
        `<div id="${id}-carte" class="clip sticker carte" data-start="${deb}" data-duration="${d}" style="left:540px;top:700px;clip-path:${dechire(rnd, 28, 1.1)}"><div class="grand">${ech(p.carte.grand)}</div>${p.carte.petits.map((x) => `<div class="petit">${ech(x)}</div>`).join("")}<div class="site">${ech(p.carte.site)}</div></div>`,
        `<div id="${id}-scotch" class="clip sticker scotch" data-start="${deb}" data-duration="${d}" style="left:360px;top:300px"></div>`,
      );
      boil(anim, `#${id}-carte`, deb, d, 0, 0, a1 * 0.5, { p: 3, r: 0.4 }, 0, rnd);
      boil(anim, `#${id}-scotch`, deb, d, 0, 0, -38, { p: 2, r: 1 }, 0.1, rnd);
    } else {
      const [i1, i2] = p.icones;
      el.push(
        `<div id="${id}-clip" class="clip sticker journal" data-start="${deb}" data-duration="${d}" style="left:540px;top:430px;clip-path:${dechire(rnd)}"><div class="rubrique">${ech(e.rubrique || "Histoires de chantier")}</div><h2>${surligner(p.titre)}</h2><p>${ech(p.extrait)}</p></div>`,
        `<div id="${id}-scotch" class="clip sticker scotch" data-start="${deb}" data-duration="${d}" style="left:500px;top:150px"></div>`,
        `<div id="${id}-i0" class="clip sticker blob" data-start="${deb}" data-duration="${d}" style="left:300px;top:880px">${icone(i1)}</div>`,
      );
      boil(anim, `#${id}-clip`, deb, d, 0, 0, -2.5 + a1 * 0.3, { p: 3, r: 0.5 }, 0, rnd);
      boil(anim, `#${id}-scotch`, deb, d, 0, 0, -4, { p: 2, r: 1 }, 0.08, rnd);
      boil(anim, `#${id}-i0`, deb, d, 0, 0, 6, { p: 3, r: 0.8 }, 0.25, rnd);
      if (i2) {
        el.push(`<div id="${id}-i1" class="clip sticker blob b" data-start="${deb}" data-duration="${d}" style="left:770px;top:965px">${icone(i2)}</div>`);
        boil(anim, `#${id}-i1`, deb, d, 0, 0, -7, { p: 3, r: 0.8 }, 0.5, rnd);
      }
    }
    el.push(`<div id="${id}-phrase" class="clip sticker phrase" data-start="${deb}" data-duration="${d}" style="left:540px;top:1295px"><span>${motsCles(p.phrase)}</span></div>`);
    boil(anim, `#${id}-phrase`, deb, d, 0, 0, 0, { p: 2, r: 0.2 }, 0.12, rnd);
    t += d;
  });
  // Le papier « bouillonne » : le grain change à chaque image.
  const n = Math.round(total * IMAGES_PAR_SECONDE);
  for (let k = 0; k < n; k++) anim.push(`tl.set("#grain", { attr: { seed: ${(k % 3) + 1} } }, ${r2(k / IMAGES_PAR_SECONDE)});`);
  if (e.voix) el.push(`<audio id="voix" src="${ech(e.voix)}" data-start="0" data-duration="${total}" data-volume="1"></audio>`);
  if (e.musique) el.push(`<audio id="musique" src="${ech(e.musique)}" data-start="0" data-duration="${total}" data-volume="${e.voix ? 0.1 : 0.5}" data-fade-in="0.3" data-fade-out="1"></audio>`);

  return `<!doctype html>
<html lang="fr" data-resolution="portrait">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=1080, height=1920" />
<script src="gsap.min.js"></script>
<style>
@font-face { font-family: "Anton"; src: url("Anton-Regular.woff2"); font-weight: 400; }
@font-face { font-family: "Inter Display"; src: url("InterDisplay-SemiBold.otf"); font-weight: 600; }
@font-face { font-family: "Inter Display"; src: url("InterDisplay-ExtraBold.otf"); font-weight: 800; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 1080px; height: 1920px; overflow: hidden; background: #c9a878; }
#root { position: relative; width: 100%; height: 100%; overflow: hidden; font-family: "Inter Display", sans-serif; color: #141414; }
#papier { position: absolute; inset: 0; }
.clip { position: absolute; }
.sticker { transform-origin: center center; }
.journal { width: 900px; padding: 44px 50px 48px; background: #f6f1e4; filter: drop-shadow(0 14px 14px rgba(40,25,10,.35)); background-image: repeating-linear-gradient(0deg, rgba(0,0,0,.035) 0 2px, transparent 2px 5px); }
.journal .rubrique { font-weight: 800; font-size: 26px; letter-spacing: .18em; text-transform: uppercase; color: #a63b12; border-bottom: 3px solid #141414; padding-bottom: 10px; margin-bottom: 18px; }
.journal h2 { font-family: "Anton", sans-serif; font-weight: 400; font-size: 100px; line-height: 1.02; text-transform: uppercase; }
.journal mark { background: #ffd60a; color: #141414; padding: 0 12px; display: inline-block; line-height: .98; margin-top: 6px; }
.journal p { font-weight: 800; font-size: 36px; line-height: 1.3; margin-top: 22px; color: #2a2a2a; }
.blob { width: 400px; height: 400px; display: flex; align-items: center; justify-content: center; background: #f2843a; border-radius: 46% 54% 51% 49% / 55% 45% 55% 45%; border: 16px solid #fcfcf8; box-shadow: 0 14px 18px rgba(40,25,10,.35); }
.blob.b { background: #ffd60a; border-radius: 52% 48% 44% 56% / 47% 55% 45% 53%; }
.blob svg { width: 230px; height: 230px; }
.scotch { width: 230px; height: 62px; background: rgba(255,236,160,.85); background-image: repeating-linear-gradient(90deg, rgba(255,255,255,.35) 0 4px, transparent 4px 9px); }
.phrase { width: 900px; text-align: center; }
.phrase span { display: inline; background: #ffd60a; color: #141414; font-weight: 800; font-size: 66px; line-height: 1.5; text-transform: uppercase; padding: 8px 22px; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
.phrase .cle { background: #141414; color: #ffd60a; padding: 0 10px; }
.carte { width: 880px; padding: 70px 56px; background: #ffd60a; text-align: center; filter: drop-shadow(0 14px 14px rgba(40,25,10,.35)); background-image: repeating-linear-gradient(90deg, rgba(0,0,0,.05) 0 2px, transparent 2px 6px); }
.carte .grand { font-family: "Anton", sans-serif; font-size: 130px; line-height: 1.02; text-transform: uppercase; }
.carte .petit { display: inline-block; margin-top: 22px; background: #141414; color: #ffd60a; font-family: "Anton", sans-serif; font-size: 66px; text-transform: uppercase; padding: 6px 22px; }
.carte .site { margin-top: 34px; font-weight: 800; font-size: 46px; }
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="1080" data-height="1920">
<svg id="papier" width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
<filter id="kraft" x="0" y="0" width="100%" height="100%"><feTurbulence id="grain" type="fractalNoise" baseFrequency="0.011 0.16" numOctaves="3" seed="1" result="b"/><feColorMatrix in="b" type="matrix" values="0 0 0 0 0.32  0 0 0 0 0.2  0 0 0 0 0.08  0 0 0 0.5 0"/></filter>
<rect width="1080" height="1920" fill="#c9a878"/><rect width="1080" height="1920" filter="url(#kraft)"/>
</svg>
${el.join("\n")}
</div>
<script>
window.__timelines = window.__timelines || {};
gsap.set(".sticker", { xPercent: -50, yPercent: -50, scale: 0 });
const tl = gsap.timeline({ paused: true });
${anim.join("\n")}
window.__timelines["main"] = tl;
tl.seek(0);
</script>
</body>
</html>
`;
}
