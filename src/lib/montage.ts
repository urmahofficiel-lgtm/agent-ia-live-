import { z } from "zod";
import { marcheDe, reglesMarche } from "./marches";

// Studio montage IA : à partir d'un lien (ou d'un sujet), l'IA écrit un plan
// de montage phrase par phrase — image adaptée, emoji, effet, transition, son —
// que l'utilisateur relit et modifie avant le montage. Fonctions pures.

export const EFFETS = [
  { id: "zoom_avant", nom: "Zoom avant" },
  { id: "zoom_arriere", nom: "Zoom arrière" },
  { id: "secousse", nom: "Secousse" },
  { id: "flash", nom: "Flash blanc" },
  { id: "aucun", nom: "Aucun" },
] as const;
export const TRANSITIONS = [
  { id: "coupe", nom: "Coupe sèche" },
  { id: "fondu", nom: "Fondu" },
  { id: "glissement", nom: "Glissement" },
  { id: "zoom", nom: "Zoom" },
  { id: "flash", nom: "Flash" },
] as const;
export const SONS = [
  { id: "whoosh", nom: "Whoosh" },
  { id: "pop", nom: "Pop" },
  { id: "ding", nom: "Ding" },
  { id: "aucun", nom: "Aucun" },
] as const;
export const SOURCES = [
  { id: "video", nom: "Vidéo filmée (Pexels)" },
  { id: "image_ia", nom: "Image IA" },
  { id: "capture", nom: "Capture de l'appli" },
] as const;
export const VOIX_MONTAGE = [
  { id: "Charon", nom: "Homme posé" },
  { id: "Puck", nom: "Homme dynamique" },
  { id: "Kore", nom: "Femme posée" },
  { id: "Leda", nom: "Femme dynamique" },
] as const;

// Emojis proposés dans l'éditeur (la police des sous-titres n'en a pas : ils
// sont ajoutés en image au montage).
export const EMOJIS = ["🔥", "😤", "😱", "🤯", "💸", "💰", "✅", "❌", "⚠️", "⏰", "📱", "📸", "🧾", "📊", "🏗️", "🔨", "👷", "🏠", "🤝", "👉", "💡", "🚀", "😅", "😎", "👀", "🙌", "💪", "📈", "📉", "⭐"];

type Ids<T extends readonly { id: string }[]> = T[number]["id"];
export type Effet = Ids<typeof EFFETS>;
export type Transition = Ids<typeof TRANSITIONS>;
export type Son = Ids<typeof SONS>;
export type Source = Ids<typeof SOURCES>;

const ids = <T extends readonly { id: string }[]>(l: T) => l.map((x) => x.id) as [Ids<T>, ...Ids<T>[]];
const texte = (max: number) => z.string().catch("").transform((x) => x.replace(/[{}\\]/g, "").replace(/\s+/g, " ").trim().slice(0, max));

const schemaScene = z.object({
  phrase: texte(220),
  texte: texte(60),
  mots_forts: z.array(z.string()).catch([]).transform((l) => l.map((m) => m.trim()).filter(Boolean).slice(0, 3)),
  emoji: z.string().catch("").transform((e) => premierEmoji(e)),
  effet: z.enum(ids(EFFETS)).catch("zoom_avant"),
  transition: z.enum(ids(TRANSITIONS)).catch("coupe"),
  son: z.enum(ids(SONS)).catch("aucun"),
  source: z.enum(ids(SOURCES)).catch("video"),
  recherche: texte(80),
  prompt: texte(300),
  // Séquence Pexels choisie dans l'éditeur (sinon : la première qui convient).
  choix: z.number().int().positive().nullable().catch(null),
  apercu: z.string().url().nullable().catch(null),
});
export type SceneMontage = z.infer<typeof schemaScene>;

const schemaPlan = z.object({
  titre: texte(80),
  accroche: texte(70),
  cta: texte(60),
  legende: z.string().catch("").transform((x) => x.trim().slice(0, 2000)),
  voix: z.enum(ids(VOIX_MONTAGE)).catch("Charon"),
  scenes: z.array(z.unknown()).catch([]).transform((l) =>
    l
      .map((x) => schemaScene.safeParse(x))
      .flatMap((r) => (r.success && r.data.phrase ? [r.data] : []))
      .slice(0, 12),
  ),
});
export type PlanMontage = z.infer<typeof schemaPlan>;

// Premier emoji d'un texte (avec ses modificateurs), ou "".
export function premierEmoji(t: string) {
  return t.match(/\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*/u)?.[0] ?? "";
}

// Nom du fichier Noto Emoji (« emoji_u1f525.png »), sans le sélecteur FE0F.
export function fichierEmoji(e: string) {
  const codes = [...e].map((c) => c.codePointAt(0)!).filter((c) => c !== 0xfe0f);
  return codes.length ? `emoji_u${codes.map((c) => c.toString(16)).join("_")}.png` : "";
}
export const URL_EMOJIS = "https://cdn.jsdelivr.net/gh/googlefonts/noto-emoji@v2.047/png/512/";

export function lirePlan(reponse: string | unknown): PlanMontage | null {
  let brut: unknown = reponse;
  if (typeof reponse === "string") {
    const json = reponse.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return null;
    try {
      brut = JSON.parse(json);
    } catch {
      return null;
    }
  }
  const r = schemaPlan.safeParse(brut);
  if (!r.success || r.data.scenes.length < 2) return null;
  // La dernière scène n'a pas de transition après elle.
  return { ...r.data, accroche: r.data.accroche || r.data.titre, cta: r.data.cta || "Lien en bio" };
}

export function consignePlan(
  source: { lien?: string; sujet?: string; extrait?: string },
  contexte: string | null,
  duree: number,
  marche?: string | null,
) {
  return `Tu es un monteur vidéo expert de TikTok, Reels et Shorts (niveau CapCut pro). Prépare le plan de montage d'une vidéo verticale de ${duree} secondes environ, en ${marcheDe(marche).langue}.
${source.lien ? `Lien à mettre en avant : ${source.lien}\n` : ""}${source.sujet ? `Sujet : ${source.sujet}\n` : ""}${source.extrait ? `\nCe que dit la page (source de vérité) :\n${source.extrait}\n` : ""}${contexte ? `\nFiche de la marque (source de vérité, n'invente aucun chiffre, prix, client ou témoignage) :\n${contexte}\n` : ""}
Règles de montage :
- Scène 1 = accroche qui arrête le défilement dans la 1re seconde (question choc, chiffre fort tiré de la source, « POV : … », situation vécue). Puis le problème, la solution concrète, la preuve, et la dernière scène = appel à l'action avec le nom de la marque.
- Une phrase parlée par scène (8 à 18 mots), langage oral, phrases courtes. 5 à 8 scènes au total.
- « texte » : 2 à 5 mots forts affichés en gros (pas une copie de la phrase).
- « mots_forts » : 1 à 2 mots de la phrase à faire ressortir en couleur.
- « emoji » : un seul emoji qui renforce l'émotion de la scène, ou "" si aucun ne colle (pas plus d'une scène sur deux).
- « effet » : zoom_avant (insister), zoom_arriere (révéler), secousse (choc, problème), flash (moment clé), aucun. Varie.
- « transition » vers la scène suivante : coupe (rythme), fondu, glissement, zoom, flash. Surtout des coupes, 2 ou 3 effets au plus.
- « son » au début de la scène : whoosh (transition forte), pop (apparition), ding (bonne nouvelle), aucun.
- « source » : video (séquence filmée réaliste : métier, gestes, décor), capture (scène qui montre le produit lui-même), image_ia (idée abstraite introuvable en vidéo).
- « recherche » : 2 à 4 mots-clés anglais pour trouver une vraie vidéo de stock de CE moment précis (ex. "construction worker phone site"). « prompt » : description anglaise d'une photo réaliste verticale, sans texte.
Réponds UNIQUEMENT par un objet JSON valide :
{"titre": "titre court", "accroche": "accroche affichée en haut au début, 4 à 8 mots", "cta": "appel à l'action affiché à la fin, 2 à 6 mots", "voix": "Charon", "scenes": [{"phrase": "...", "texte": "...", "mots_forts": ["..."], "emoji": "🔥", "effet": "zoom_avant", "transition": "coupe", "son": "whoosh", "source": "video", "recherche": "...", "prompt": "..."}], "legende": "texte du post : accroche, 2 phrases, appel à l'action avec le lien, 3 à 5 hashtags"}${reglesMarche(marche) ? `\n${reglesMarche(marche)}` : ""}`;
}

// --- Minutage --------------------------------------------------------------------

// Poids d'une phrase dans la voix off (longueur, pauses de ponctuation).
const poids = (p: string) => p.length + 8 + (p.match(/[.!?…,;:]/g)?.length ?? 0) * 4;

// Durée de chaque scène : partage de la durée de la voix au prorata des
// phrases ; sans voix, temps de lecture.
export function dureesScenes(scenes: { phrase: string }[], dureeVoix?: number) {
  if (!dureeVoix) return scenes.map((s) => Math.round(Math.min(5, Math.max(1.8, 0.9 + s.phrase.length * 0.055)) * 100) / 100);
  const total = scenes.reduce((a, s) => a + poids(s.phrase), 0);
  return scenes.map((s) => Math.round(((dureeVoix + 0.5) * poids(s.phrase)) / total * 100) / 100);
}

export const debutsScenes = (d: number[]) => d.map((_, i) => d.slice(0, i).reduce((a, b) => a + b, 0));

// Durée de la transition après une scène (une « coupe » reste très brève).
export const dureeTransition = (t: Transition) => (t === "coupe" ? 0.04 : 0.35);
export const XFADE: Record<Transition, string> = { coupe: "fade", fondu: "fade", glissement: "slideleft", zoom: "zoomin", flash: "fadewhite" };

// --- Sous-titres ASS (mot à mot) ---------------------------------------------------

const h = (s: number) => {
  const x = Math.max(0, s);
  return `${Math.floor(x / 3600)}:${String(Math.floor((x % 3600) / 60)).padStart(2, "0")}:${(x % 60).toFixed(2).padStart(5, "0")}`;
};

// Mots d'une phrase minutés entre `debut` et `debut + duree`.
export function motsMinutes(phrase: string, debut: number, duree: number) {
  const mots = phrase.split(" ").filter(Boolean);
  const p = mots.map((m) => m.length + 2 + (/[.!?…,;:]$/.test(m) ? 3 : 0));
  const somme = p.reduce((a, b) => a + b, 0) || 1;
  let t = debut;
  return mots.map((mot, i) => {
    const fin = i === mots.length - 1 ? debut + duree : t + (duree * p[i]) / somme;
    const r = { mot, debut: t, fin };
    t = fin;
    return r;
  });
}

// Groupes de 3 mots au plus (14 caractères), fermés à la ponctuation.
export function groupes<T extends { mot: string }>(mots: T[]) {
  const sortie: T[][] = [];
  let courant: T[] = [];
  for (const m of mots) {
    if (courant.length && courant.map((x) => x.mot).join(" ").length + 1 + m.mot.length > 16) {
      sortie.push(courant);
      courant = [];
    }
    courant.push(m);
    if (courant.length >= 3 || /[.!?…,;:]$/.test(m.mot)) {
      sortie.push(courant);
      courant = [];
    }
  }
  if (courant.length) sortie.push(courant);
  return sortie;
}

const sansAccent = (m: string) => m.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();

// Sous-titres : accroche en haut au début, gros texte de la scène en haut,
// sous-titres karaoké au centre (mot prononcé en couleur, mots forts en jaune,
// petit rebond), appel à l'action à la fin.
export function sousTitresMontage(plan: PlanMontage, d: number[], accent = "&H0000D7FF&") {
  const debuts = debutsScenes(d);
  const total = d.reduce((a, b) => a + b, 0);
  const ev: string[] = [];
  const dial = (couche: number, a: number, b: number, style: string, t: string) => ev.push(`Dialogue: ${couche},${h(a)},${h(b)},${style},,0,0,0,,${t}`);
  if (plan.accroche) dial(3, 0, Math.min(2.6, d[0] + 0.5), "Accroche", `{\\fad(60,200)\\fscx110\\fscy110\\t(0,120,\\fscx100\\fscy100)}${plan.accroche.toUpperCase()}`);
  plan.scenes.forEach((s, i) => {
    const debut = debuts[i];
    const fin = debut + d[i];
    if (s.texte && !(i === 0 && plan.accroche)) dial(2, debut, fin, "Titre", `{\\fad(80,80)}${s.texte.toUpperCase()}`);
    const forts = new Set(s.mots_forts.flatMap((m) => m.split(" ")).map(sansAccent));
    const mots = motsMinutes(s.phrase, debut, d[i]);
    for (const g of groupes(mots)) {
      g.forEach((m, j) => {
        const finMot = j === g.length - 1 ? m.fin : g[j + 1].debut;
        const ligne = g
          .map((x, n) => {
            const mot = x.mot.toUpperCase();
            if (n === j) return `{\\1c${accent}}${mot}{\\1c&HFFFFFF&}`;
            return forts.has(sansAccent(x.mot)) ? `{\\1c&H0066FF66&}${mot}{\\1c&HFFFFFF&}` : mot;
          })
          .join(" ");
        const rebond = j === 0 ? "\\fscx118\\fscy118\\t(0,100,\\fscx100\\fscy100)" : "";
        dial(1, m.debut, finMot, "Mots", `{${rebond}}${ligne}`);
      });
    }
  });
  if (plan.cta) dial(4, Math.max(0, total - d[d.length - 1]), total, "Cta", `{\\fad(150,0)\\fscx112\\fscy112\\t(0,160,\\fscx100\\fscy100)}${plan.cta.toUpperCase()}`);
  return `[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Mots,DejaVu Sans,60,&H00FFFFFF,&H00FFFFFF,&H00000000,&H99000000,-1,0,0,0,100,100,0,0,1,7,3,5,50,50,0,1
Style: Titre,DejaVu Sans,44,&H00111111,&H00111111,&H00FFFFFF,&H00000000,-1,0,0,0,100,100,0,0,3,14,0,8,60,60,150,1
Style: Accroche,DejaVu Sans,52,&H00FFFFFF,&H00FFFFFF,&H000000E0,&H00000000,-1,0,0,0,100,100,0,0,3,18,0,8,50,50,140,1
Style: Cta,DejaVu Sans,54,&H00111111,&H00111111,&H0000D7FF,&H00000000,-1,0,0,0,100,100,0,0,3,18,0,2,60,60,230,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${ev.join("\n")}
`;
}

// Nouvelle scène vide (bouton « Ajouter une scène » de l'éditeur).
export const sceneVide = (): SceneMontage => ({
  phrase: "",
  texte: "",
  mots_forts: [],
  emoji: "",
  effet: "zoom_avant",
  transition: "coupe",
  son: "aucun",
  source: "video",
  recherche: "",
  prompt: "",
  choix: null,
  apercu: null,
});

// Plan prêt à monter : au moins 2 scènes avec une phrase.
export function planValide(plan: PlanMontage) {
  const pleines = plan.scenes.filter((s) => s.phrase.trim());
  if (pleines.length < 2) return "Il faut au moins 2 scènes avec une phrase.";
  if (pleines.length > 12) return "12 scènes au maximum.";
  return null;
}
