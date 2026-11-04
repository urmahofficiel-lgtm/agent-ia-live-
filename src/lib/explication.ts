// Vidéo « Explication » (HyperFrames) : format sans visage, un plan toutes les
// 2 à 3 secondes, inspiré des comptes « une astuce par jour ». Chaque plan :
// un titre en 2 lignes (la 2e en couleur), au centre UNE illustration de la
// phrase (capture du produit avec un cadre sur l'essentiel, gros chiffre,
// liste qui se coche, dictée, SMS, lignes de devis, bouton), en bas la phrase
// dite par la voix avec le mot clé en couleur. Fin : « Commente … » et bouton
// S'abonner qui se coche.

export type VisuelExplication =
  | { type: "capture"; image: string; largeur: number; hauteur: number; focus?: { x: number; y: number }; echelle?: number; cadre?: { x: number; y: number; l: number; h: number } }
  | { type: "chiffre"; valeur: string; legende?: string }
  | { type: "liste"; items: string[] }
  | { type: "dictee"; texte: string }
  | { type: "sms"; contact: string; message: string; reponse?: string }
  | { type: "devis"; lignes: [string, string][] }
  | { type: "bouton"; texte: string }
  | { type: "appel"; mot: string; detail?: string };

export type PlanCourt = {
  titre: [string, string];
  phrase: string; // phrase dite ; le mot clé entre *astérisques* passe en couleur
  duree: number;
  visuel: VisuelExplication;
};

export type Explication = {
  plans: PlanCourt[];
  marque: string;
  compte?: string | null; // @compte affiché en bas
  serie?: string | null; // ex. « Une astuce chantier par jour »
  accent?: string | null;
  voix?: string | null;
  musique?: string | null;
};

export const POLICES_EXPLICATION = ["Anton-Regular.woff2", "InterDisplay-SemiBold.otf", "InterDisplay-ExtraBold.otf"];

const ech = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const r2 = (n: number) => Math.round(n * 100) / 100;
const couleur = (c: string | null | undefined) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : "#f28a1e");
// *mot* → mot en couleur (le reste échappé).
export const motsCles = (t: string) => ech(t).replace(/\*([^*]+)\*/g, '<span class="cle">$1</span>');

// Cadre de la capture : 940 × 760, image zoomée sur `focus`, rectangle de
// mise en avant `cadre` (fractions de l'image) converti en pixels du cadre.
export function placementCapture(v: Extract<VisuelExplication, { type: "capture" }>, L = 940, H = 760) {
  const largeur = L * (v.echelle ?? 1);
  const hauteur = (v.hauteur / v.largeur) * largeur;
  const fx = v.focus?.x ?? 0.5;
  const fy = v.focus?.y ?? 0.5;
  const gauche = Math.min(0, Math.max(L - largeur, L / 2 - fx * largeur));
  const haut = Math.min(0, Math.max(H - hauteur, H / 2 - fy * hauteur));
  const c = v.cadre ? { x: gauche + v.cadre.x * largeur, y: haut + v.cadre.y * hauteur, l: v.cadre.l * largeur, h: v.cadre.h * hauteur } : null;
  return { largeur: r2(largeur), hauteur: r2(hauteur), gauche: r2(gauche), haut: r2(haut), cadre: c && { x: r2(c.x), y: r2(c.y), l: r2(c.l), h: r2(c.h) } };
}

function visuel(v: VisuelExplication, id: string, t: number, d: number, anim: string[], accent: string) {
  const a = (s: string) => anim.push(s);
  switch (v.type) {
    case "capture": {
      const p = placementCapture(v);
      a(`tl.fromTo("#${id}-img", { scale: 1.06 }, { scale: 1, duration: ${r2(Math.min(d, 2.5))}, ease: "power2.out" }, ${t});`);
      if (p.cadre) a(`tl.fromTo("#${id}-cadre", { scale: 1.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(2)" }, ${r2(t + 0.35)});`);
      return `<div class="capture"><img id="${id}-img" src="${ech(v.image)}" style="width:${p.largeur}px;height:${p.hauteur}px;left:${p.gauche}px;top:${p.haut}px" alt="">${
        p.cadre ? `<div id="${id}-cadre" class="cadre" style="left:${p.cadre.x - 10}px;top:${p.cadre.y - 10}px;width:${p.cadre.l + 20}px;height:${p.cadre.h + 20}px"></div>` : ""
      }</div>`;
    }
    case "chiffre":
      a(`tl.fromTo("#${id}-v", { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(2.2)" }, ${r2(t + 0.05)});`);
      if (v.legende) a(`tl.fromTo("#${id}-l", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.25 }, ${r2(t + 0.3)});`);
      return `<div class="chiffre"><div id="${id}-v" class="valeur">${ech(v.valeur)}</div>${v.legende ? `<div id="${id}-l" class="legende">${ech(v.legende)}</div>` : ""}</div>`;
    case "liste": {
      const pas = Math.max(0.3, Math.min(0.7, (d - 0.6) / Math.max(1, v.items.length)));
      v.items.forEach((_, k) => {
        a(`tl.fromTo("#${id}-i${k}", { x: 60, opacity: 0 }, { x: 0, opacity: 1, duration: 0.2 }, ${r2(t + 0.1 + k * pas)});`);
        a(`tl.fromTo("#${id}-c${k}", { backgroundColor: "rgba(0,0,0,0)" }, { backgroundColor: "${accent}", duration: 0.15 }, ${r2(t + 0.3 + k * pas)});`);
        a(`tl.fromTo("#${id}-v${k}", { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.15 }, ${r2(t + 0.3 + k * pas)});`);
      });
      return `<div class="liste">${v.items.map((it, k) => `<div id="${id}-i${k}" class="item"><span id="${id}-c${k}" class="case"><span id="${id}-v${k}" class="coche">✓</span></span>${ech(it)}</div>`).join("")}</div>`;
    }
    case "dictee": {
      const mots = v.texte.split(/\s+/).filter(Boolean);
      const pas = Math.max(0.04, (d - 0.8) / Math.max(1, mots.length));
      a(`tl.fromTo("#${id}-micro", { scale: 1 }, { scale: 1.15, duration: 0.3, yoyo: true, repeat: ${Math.max(1, Math.floor(d / 0.3) - 1)}, ease: "sine.inOut" }, ${t});`);
      mots.forEach((_, k) => a(`tl.fromTo("#${id}-m${k}", { opacity: 0 }, { opacity: 1, duration: 0.05 }, ${r2(t + 0.3 + k * pas)});`));
      return `<div class="dictee"><div id="${id}-micro" class="micro">🎙️</div><div class="texte">${mots.map((m, k) => `<span id="${id}-m${k}">${ech(m)}</span>`).join(" ")}</div></div>`;
    }
    case "sms":
      a(`tl.fromTo("#${id}-tel", { y: 120, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: "power3.out" }, ${t});`);
      a(`tl.fromTo("#${id}-b1", { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.25, ease: "back.out(2)" }, ${r2(t + 0.4)});`);
      if (v.reponse) a(`tl.fromTo("#${id}-b2", { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.25, ease: "back.out(2)" }, ${r2(t + Math.min(d - 0.5, 1.4))});`);
      return `<div id="${id}-tel" class="sms"><div class="contact">${ech(v.contact)}</div><div id="${id}-b1" class="bulle moi">${ech(v.message)}</div>${
        v.reponse ? `<div id="${id}-b2" class="bulle lui">${ech(v.reponse)}</div>` : ""
      }</div>`;
    case "devis": {
      const pas = Math.max(0.2, Math.min(0.45, (d - 0.5) / Math.max(1, v.lignes.length)));
      v.lignes.forEach((_, k) => a(`tl.fromTo("#${id}-l${k}", { x: 50, opacity: 0 }, { x: 0, opacity: 1, duration: 0.18 }, ${r2(t + 0.15 + k * pas)});`));
      return `<div class="devis">${v.lignes.map(([l, q], k) => `<div id="${id}-l${k}" class="ligne"><span>${ech(l)}</span><b>${ech(q)}</b></div>`).join("")}</div>`;
    }
    case "bouton":
      a(`tl.fromTo("#${id}-btn", { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(2)" }, ${t});`);
      a(`tl.to("#${id}-btn", { scale: 0.92, duration: 0.1, yoyo: true, repeat: 1 }, ${r2(t + Math.min(d - 0.4, 1))});`);
      a(`tl.fromTo("#${id}-doigt", { y: 160, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3 }, ${r2(t + Math.min(d - 0.7, 0.7))});`);
      return `<div class="bouton-zone"><div id="${id}-btn" class="bouton">${ech(v.texte)}</div><div id="${id}-doigt" class="doigt">👆</div></div>`;
    case "appel":
      a(`tl.fromTo("#${id}-box", { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(1.8)" }, ${t});`);
      a(`tl.fromTo("#${id}-abo", { backgroundColor: "#3a4150" }, { backgroundColor: "#22c55e", duration: 0.12 }, ${r2(t + Math.min(d - 0.6, 1.4))});`);
      a(`tl.fromTo("#${id}-abo-a", { opacity: 1 }, { opacity: 0, duration: 0.08 }, ${r2(t + Math.min(d - 0.6, 1.4))});`);
      a(`tl.fromTo("#${id}-abo-b", { opacity: 0 }, { opacity: 1, duration: 0.08 }, ${r2(t + Math.min(d - 0.6, 1.4))});`);
      return `<div class="appel"><div id="${id}-box" class="boite"><div class="petit">COMMENTE</div><div class="mot">${ech(v.mot)}</div>${
        v.detail ? `<div class="detail">${ech(v.detail)}</div>` : ""
      }</div><div id="${id}-abo" class="abonne"><span id="${id}-abo-a">S'ABONNER</span><span id="${id}-abo-b" class="apres">ABONNÉ ✓</span></div></div>`;
  }
}

export const dureeExplication = (e: Explication) => r2(e.plans.reduce((a, p) => a + p.duree, 0));

export function compositionExplication(e: Explication) {
  const accent = couleur(e.accent);
  const total = dureeExplication(e);
  const el: string[] = [];
  const anim: string[] = [];
  let t = 0;
  e.plans.forEach((p, i) => {
    const d = r2(p.duree);
    const deb = r2(t);
    const id = `p${i}`;
    // Le premier plan est déjà à l'écran à 0 s (miniature des réseaux).
    el.push(
      `<div id="${id}-titre" class="clip titre" data-start="${deb}" data-duration="${d}"><div class="l1">${ech(p.titre[0])}</div><div class="l2">${ech(p.titre[1])}</div></div>`,
      `<div id="${id}-centre" class="clip centre" data-start="${deb}" data-duration="${d}">${visuel(p.visuel, id, deb, d, anim, accent)}</div>`,
      `<div id="${id}-phrase" class="clip phrase" data-start="${deb}" data-duration="${d}">${motsCles(p.phrase)}</div>`,
    );
    if (i > 0) {
      anim.push(`tl.fromTo("#${id}-titre .l1", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.2, ease: "power3.out" }, ${deb});`);
      anim.push(`tl.fromTo("#${id}-titre .l2", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.2, ease: "power3.out" }, ${r2(deb + 0.08)});`);
    }
    anim.push(`tl.fromTo("#${id}-phrase", { scale: 0.9, opacity: ${i ? 0 : 1} }, { scale: 1, opacity: 1, duration: 0.18, ease: "back.out(2)" }, ${r2(deb + (i ? 0.1 : 0))});`);
    t += p.duree;
  });
  el.push(`<div id="progression" class="clip progression" data-start="0" data-duration="${total}"></div>`);
  anim.push(`tl.fromTo("#progression", { scaleX: 0 }, { scaleX: 1, duration: ${total}, ease: "none" }, 0);`);
  if (e.compte) el.push(`<div id="compte" class="clip compte" data-start="0" data-duration="${total}">${ech(e.compte)}${e.serie ? ` · ${ech(e.serie)}` : ""}</div>`);
  if (e.voix) el.push(`<audio id="voix" src="${ech(e.voix)}" data-start="0" data-duration="${total}" data-volume="1"></audio>`);
  if (e.musique) el.push(`<audio id="musique" src="${ech(e.musique)}" data-start="0" data-duration="${total}" data-volume="${e.voix ? 0.13 : 0.5}" data-fade-in="0.3" data-fade-out="1"></audio>`);

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
:root { --accent: ${accent}; --fond: #0d1117; --carte: #161c27; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 1080px; height: 1920px; overflow: hidden; background: var(--fond); }
#root { position: relative; width: 100%; height: 100%; color: #fff; font-family: "Inter Display", sans-serif; overflow: hidden; }
.clip { position: absolute; }
.titre { left: 70px; right: 70px; top: 170px; font-family: "Anton", sans-serif; font-size: 128px; line-height: 0.98; text-transform: uppercase; letter-spacing: 0.005em; }
.titre .l2 { color: var(--accent); }
.centre { left: 70px; width: 940px; top: 520px; height: 860px; display: flex; align-items: center; justify-content: center; }
.phrase { left: 60px; right: 60px; top: 1480px; text-align: center; font-family: "Anton", sans-serif; font-size: 66px; line-height: 1.1; text-transform: uppercase; }
.cle { color: var(--accent); }
.compte { left: 0; right: 0; bottom: 110px; text-align: center; font-weight: 600; font-size: 32px; color: #8b93a3; }
.progression { left: 0; top: 0; width: 1080px; height: 10px; background: var(--accent); transform-origin: left center; }
.capture { position: relative; width: 940px; height: 760px; border-radius: 32px; overflow: hidden; background: #fff; box-shadow: 0 30px 80px rgba(0,0,0,.5); }
.capture img { position: absolute; transform-origin: center; }
.cadre { position: absolute; border: 8px solid var(--accent); border-radius: 18px; box-shadow: 0 0 0 9999px rgba(13,17,23,.35); }
.chiffre { text-align: center; }
.valeur { font-family: "Anton", sans-serif; font-size: 300px; line-height: 1; color: var(--accent); }
.legende { margin-top: 20px; font-weight: 800; font-size: 54px; }
.liste { width: 860px; display: flex; flex-direction: column; gap: 34px; }
.item { display: flex; align-items: center; gap: 34px; background: var(--carte); border-radius: 22px; padding: 30px 36px; font-weight: 800; font-size: 56px; }
.case { width: 72px; height: 72px; border: 6px solid var(--accent); border-radius: 14px; display: inline-flex; align-items: center; justify-content: center; font-size: 48px; flex: none; }
.dictee { width: 900px; background: var(--carte); border-radius: 32px; padding: 50px; display: flex; gap: 36px; align-items: flex-start; }
.micro { font-size: 110px; line-height: 1; flex: none; }
.dictee .texte { font-weight: 600; font-size: 50px; line-height: 1.3; }
.sms { width: 640px; height: 820px; background: #0a0d13; border: 14px solid #2a3140; border-radius: 70px; padding: 70px 40px; display: flex; flex-direction: column; gap: 30px; }
.contact { text-align: center; font-weight: 800; font-size: 40px; color: #c9ced8; padding-bottom: 24px; border-bottom: 2px solid #2a3140; }
.bulle { max-width: 470px; padding: 26px 32px; border-radius: 34px; font-weight: 600; font-size: 42px; line-height: 1.25; }
.bulle.moi { align-self: flex-end; background: var(--accent); color: #0d1117; }
.bulle.lui { align-self: flex-start; background: #22c55e; color: #052e13; }
.devis { width: 900px; background: #f5efe6; color: #0d1117; border-radius: 30px; padding: 20px 46px; }
.ligne { display: flex; justify-content: space-between; padding: 28px 0; border-bottom: 3px dashed #d6cbbb; font-weight: 600; font-size: 46px; }
.ligne:last-child { border-bottom: 0; }
.ligne b { font-weight: 800; color: #a85d10; margin-left: 30px; white-space: nowrap; }
.bouton-zone { position: relative; display: flex; align-items: center; justify-content: center; width: 900px; height: 600px; }
.bouton { background: var(--accent); color: #0d1117; font-weight: 800; font-size: 72px; padding: 46px 80px; border-radius: 30px; box-shadow: 0 24px 60px rgba(242,138,30,.35); }
.doigt { position: absolute; font-size: 150px; left: 560px; top: 340px; }
.appel { display: flex; flex-direction: column; align-items: center; gap: 50px; }
.boite { width: 860px; border: 6px solid var(--accent); border-radius: 30px; padding: 40px 50px; }
.boite .petit { font-family: "Anton", sans-serif; font-size: 80px; }
.boite .mot { font-family: "Anton", sans-serif; font-size: 230px; line-height: 1; color: var(--accent); }
.boite .detail { margin-top: 16px; font-weight: 600; font-size: 40px; color: #c9ced8; }
.abonne .apres { position: absolute; left: 0; right: 0; opacity: 0; color: #052e13; }
.coche { display: inline-block; color: #0d1117; }
.abonne { position: relative; width: 860px; text-align: center; background: #3a4150; border-radius: 22px; padding: 30px; font-family: "Anton", sans-serif; font-size: 80px; }
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="1080" data-height="1920">
${el.join("\n")}
</div>
<script>
window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
${anim.join("\n")}
window.__timelines["main"] = tl;
tl.seek(0);
</script>
</body>
</html>
`;
}
