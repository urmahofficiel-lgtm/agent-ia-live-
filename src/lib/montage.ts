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
  { id: "ia_video", nom: "Vidéo IA (Wan, CogVideoX)" },
  { id: "video", nom: "Vidéo filmée (Pexels)" },
  { id: "image_ia", nom: "Image IA" },
  { id: "capture", nom: "Capture de l'appli" },
  { id: "perso", nom: "Mon fichier (photo ou vidéo)" },
] as const;
export const VOIX_MONTAGE = [
  { id: "Charon", nom: "Homme posé" },
  { id: "Puck", nom: "Homme dynamique" },
  { id: "Kore", nom: "Femme posée" },
  { id: "Leda", nom: "Femme dynamique" },
] as const;

// Styles de sous-titres (mot à mot). Couleurs ASS en &HBBGGRR&, et leur
// équivalent CSS pour l'aperçu en direct de l'éditeur.
export const STYLES_SOUS_TITRES = [
  { id: "karaoke", nom: "Karaoké jaune" },
  { id: "viral", nom: "Viral (énorme, vert)" },
  { id: "neon", nom: "Néon" },
  { id: "boite", nom: "Encadré" },
  { id: "sobre", nom: "Sobre (en bas)" },
] as const;

export type ParamsSousTitres = {
  taille: number;
  contour: number;
  ombre: number;
  // 5 : centre de l'écran, 2 : en bas.
  alignement: 2 | 5;
  margeV: number;
  // 1 : contour, 3 : texte dans une boîte.
  bordure: 1 | 3;
  contourAss: string;
  fondAss: string;
  accentAss: string;
  fortAss: string;
  contourCss: string;
  accentCss: string;
  fortCss: string;
  maxMots: number;
  majuscules: boolean;
  flou: number;
};

export const PARAMS_SOUS_TITRES: Record<StyleSousTitres, ParamsSousTitres> = {
  karaoke: { taille: 60, contour: 7, ombre: 3, alignement: 5, margeV: 0, bordure: 1, contourAss: "&H00000000", fondAss: "&H99000000", accentAss: "&H0000D7FF&", fortAss: "&H0066FF66&", contourCss: "#000", accentCss: "#FFD700", fortCss: "#66FF66", maxMots: 3, majuscules: true, flou: 0 },
  viral: { taille: 80, contour: 10, ombre: 4, alignement: 5, margeV: 0, bordure: 1, contourAss: "&H00000000", fondAss: "&H99000000", accentAss: "&H0014FF39&", fortAss: "&H0000D7FF&", contourCss: "#000", accentCss: "#39FF14", fortCss: "#FFD700", maxMots: 2, majuscules: true, flou: 0 },
  neon: { taille: 62, contour: 5, ombre: 0, alignement: 5, margeV: 0, bordure: 1, contourAss: "&H00FFE100", fondAss: "&H00000000", accentAss: "&H00FF3CFF&", fortAss: "&H0000F0FF&", contourCss: "#00E1FF", accentCss: "#FF3CFF", fortCss: "#FFF000", maxMots: 3, majuscules: true, flou: 3 },
  boite: { taille: 54, contour: 14, ombre: 0, alignement: 5, margeV: 0, bordure: 3, contourAss: "&H00111111", fondAss: "&H00111111", accentAss: "&H0000D7FF&", fortAss: "&H0066FF66&", contourCss: "#111", accentCss: "#FFD700", fortCss: "#66FF66", maxMots: 3, majuscules: true, flou: 0 },
  sobre: { taille: 46, contour: 3, ombre: 2, alignement: 2, margeV: 250, bordure: 1, contourAss: "&H00000000", fondAss: "&H99000000", accentAss: "&H00FFD27A&", fortAss: "&H00FFD27A&", contourCss: "#000", accentCss: "#7AD2FF", fortCss: "#7AD2FF", maxMots: 4, majuscules: false, flou: 0 },
};

// Filtres couleur appliqués à toutes les images (ffmpeg) et leur imitation CSS
// pour l'aperçu.
export const FILTRES = [
  { id: "aucun", nom: "Aucun" },
  { id: "cinema", nom: "Cinéma" },
  { id: "chaud", nom: "Chaud" },
  { id: "froid", nom: "Froid" },
  { id: "vif", nom: "Vif" },
  { id: "nb", nom: "Noir et blanc" },
] as const;
export const FILTRE_FFMPEG: Record<Filtre, string> = {
  aucun: "",
  cinema: "eq=contrast=1.12:saturation=0.9,colorbalance=rs=-0.06:bs=0.08:rh=0.08:bh=-0.06",
  chaud: "colorbalance=rs=0.08:gs=0.02:bs=-0.08:rm=0.06:bm=-0.05,eq=saturation=1.1",
  froid: "colorbalance=rs=-0.06:bs=0.1:rm=-0.04:bm=0.06",
  vif: "eq=contrast=1.08:saturation=1.45",
  nb: "hue=s=0,eq=contrast=1.15",
};
export const FILTRE_CSS: Record<Filtre, string> = {
  aucun: "none",
  cinema: "contrast(1.12) saturate(0.9) sepia(0.12) hue-rotate(-8deg)",
  chaud: "sepia(0.25) saturate(1.2)",
  froid: "saturate(0.9) hue-rotate(15deg) brightness(1.03)",
  vif: "contrast(1.08) saturate(1.45)",
  nb: "grayscale(1) contrast(1.15)",
};

// Vitesse de lecture d'une séquence filmée (ralenti, accéléré).
export const VITESSES = [0.5, 0.75, 1, 1.5, 2] as const;

// Emojis proposés dans l'éditeur (la police des sous-titres n'en a pas : ils
// sont ajoutés en image au montage).
export const EMOJIS = ["🔥", "😤", "😱", "🤯", "💸", "💰", "✅", "❌", "⚠️", "⏰", "📱", "📸", "🧾", "📊", "🏗️", "🔨", "👷", "🏠", "🤝", "👉", "💡", "🚀", "😅", "😎", "👀", "🙌", "💪", "📈", "📉", "⭐"];

type Ids<T extends readonly { id: string }[]> = T[number]["id"];
export type Effet = Ids<typeof EFFETS>;
export type Transition = Ids<typeof TRANSITIONS>;
export type Son = Ids<typeof SONS>;
export type Source = Ids<typeof SOURCES>;
export type StyleSousTitres = Ids<typeof STYLES_SOUS_TITRES>;
export type Filtre = Ids<typeof FILTRES>;

const ids = <T extends readonly { id: string }[]>(l: T) => l.map((x) => x.id) as [Ids<T>, ...Ids<T>[]];
const texte = (max: number) => z.string().catch("").transform((x) => x.replace(/[{}\\]/g, "").replace(/\s+/g, " ").trim().slice(0, max));

const niveau = z.number().catch(1).transform((v) => Math.min(2, Math.max(0, v)));

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
  // Vidéo IA : mouvement à donner à l'image (en anglais).
  mouvement: texte(300),
  // Séquence Pexels choisie dans l'éditeur (sinon : la première qui convient).
  choix: z.number().int().positive().nullable().catch(null),
  apercu: z.string().url().nullable().catch(null),
  vitesse: z.number().catch(1).transform((v) => (VITESSES as readonly number[]).includes(v) ? v : 1),
  // Fichier de l'utilisateur (source « perso ») déposé dans le stockage du Studio.
  media_url: z.string().url().nullable().catch(null),
  media_type: z.enum(["video", "image"]).nullable().catch(null),
});
export type SceneMontage = z.infer<typeof schemaScene>;

const schemaPlan = z.object({
  titre: texte(80),
  accroche: texte(70),
  cta: texte(60),
  legende: z.string().catch("").transform((x) => x.trim().slice(0, 2000)),
  voix: z.enum(ids(VOIX_MONTAGE)).catch("Charon"),
  sous_titres: z.enum(ids(STYLES_SOUS_TITRES)).catch("karaoke"),
  filtre: z.enum(ids(FILTRES)).catch("aucun"),
  // Volumes relatifs (1 = réglage par défaut).
  mix: z
    .object({ voix: niveau, musique: niveau, effets: niveau })
    .catch({ voix: 1, musique: 1, effets: 1 }),
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

// `croissance` : vidéo du mode croissance (courte, accroche sans marque ni
// salutation ; sans publicité, la fin demande d'enregistrer ou de commenter
// au lieu de vendre).
export function consignePlan(
  source: { lien?: string; sujet?: string; extrait?: string },
  contexte: string | null,
  duree: number,
  marche?: string | null,
  croissance?: { sansPub: boolean } | null,
) {
  const deroule = croissance
    ? `- Scène 1 = accroche qui arrête le défilement dans la 1re seconde : 7 mots au plus, sans nom de marque, sans salutation ni logo (erreur, chiffre tiré de la source, « POV : … », question qui pique). Puis le cœur du sujet, une idée par scène, sans temps mort.
- Dernière scène = ${
        croissance.sansPub
          ? "appel à l'engagement SANS nom de marque ni produit (« Enregistre-la pour ton prochain chantier », « Et toi, tu fais comment ? »)"
          : "appel à l'action avec le nom de la marque, en une phrase"
      }.
- Une phrase parlée par scène (6 à 14 mots), langage oral, phrases courtes. 4 à 6 scènes au total : la vidéo doit être regardée jusqu'au bout.`
    : `- Scène 1 = accroche qui arrête le défilement dans la 1re seconde (question choc, chiffre fort tiré de la source, « POV : … », situation vécue). Puis le problème, la solution concrète, la preuve, et la dernière scène = appel à l'action avec le nom de la marque.
- Une phrase parlée par scène (8 à 18 mots), langage oral, phrases courtes. 5 à 8 scènes au total.`;
  return `Tu es un monteur vidéo expert de TikTok, Reels et Shorts (niveau CapCut pro). Prépare le plan de montage d'une vidéo verticale de ${duree} secondes environ, en ${marcheDe(marche).langue}.
${source.lien ? `Lien à mettre en avant : ${source.lien}\n` : ""}${source.sujet ? `Sujet : ${source.sujet}\n` : ""}${source.extrait ? `\nCe que dit la page (source de vérité) :\n${source.extrait}\n` : ""}${contexte ? `\nFiche de la marque (source de vérité, n'invente aucun chiffre, prix, client ou témoignage) :\n${contexte}\n` : ""}
Règles de montage :
${deroule}
- « texte » : 2 à 5 mots forts affichés en gros (pas une copie de la phrase).
- « mots_forts » : 1 à 2 mots de la phrase à faire ressortir en couleur.
- « emoji » : un seul emoji qui renforce l'émotion de la scène, ou "" si aucun ne colle (pas plus d'une scène sur deux).
- « effet » : zoom_avant (insister), zoom_arriere (révéler), secousse (choc, problème), flash (moment clé), aucun. Varie.
- « transition » vers la scène suivante : coupe (rythme), fondu, glissement, zoom, flash. Surtout des coupes, 2 ou 3 effets au plus.
- « son » au début de la scène : whoosh (transition forte), pop (apparition), ding (bonne nouvelle), aucun.
- « source » : video (séquence filmée réaliste : métier, gestes, décor), ia_video (vraie vidéo générée par IA à partir d'une image : pour 1 ou 2 scènes clés au plus, celles qui doivent marquer, comme l'accroche), capture (scène qui montre le produit lui-même), image_ia (idée abstraite introuvable en vidéo).
- « mouvement » (pour ia_video) : en anglais, ce qui bouge dans la scène et le mouvement de caméra (ex. "the worker looks up surprised at his phone, slow camera push in").
- « recherche » : 2 à 4 mots-clés anglais pour trouver une vraie vidéo de stock de CE moment précis (ex. "construction worker phone site"). « prompt » : description anglaise d'une photo réaliste verticale, sans texte.
Réponds UNIQUEMENT par un objet JSON valide :
{"titre": "titre court", "accroche": "accroche affichée en haut au début, ${croissance ? "3 à 7" : "4 à 8"} mots", "cta": "${croissance?.sansPub ? "appel à l'engagement affiché à la fin, 2 à 6 mots, sans marque" : "appel à l'action affiché à la fin, 2 à 6 mots"}", "voix": "Charon", "scenes": [{"phrase": "...", "texte": "...", "mots_forts": ["..."], "emoji": "🔥", "effet": "zoom_avant", "transition": "coupe", "son": "whoosh", "source": "video", "recherche": "...", "prompt": "...", "mouvement": ""}], "legende": "texte du post : accroche, 2 phrases, appel à l'action avec le lien, 3 à 5 hashtags"}${reglesMarche(marche) ? `\n${reglesMarche(marche)}` : ""}`;
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

// Appel à l'action en bas de l'écran, au-dessus des sous-titres quand ils sont en bas.
export const margeCta = (st: Pick<ParamsSousTitres, "alignement" | "margeV">) => (st.alignement === 2 ? st.margeV + 170 : 230);

// Longueur d'une ligne de sous-titres selon le nombre de mots du style.
const maxCaracteres = (maxMots: number) => (maxMots >= 4 ? 28 : maxMots === 2 ? 14 : 16);

// Groupes de 3 mots au plus (16 caractères), fermés à la ponctuation.
export function groupes<T extends { mot: string }>(mots: T[], maxMots = 3) {
  const sortie: T[][] = [];
  let courant: T[] = [];
  for (const m of mots) {
    if (courant.length && courant.map((x) => x.mot).join(" ").length + 1 + m.mot.length > maxCaracteres(maxMots)) {
      sortie.push(courant);
      courant = [];
    }
    courant.push(m);
    if (courant.length >= maxMots || /[.!?…,;:]$/.test(m.mot)) {
      sortie.push(courant);
      courant = [];
    }
  }
  if (courant.length) sortie.push(courant);
  return sortie;
}

const sansAccent = (m: string) => m.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();

// Sous-titres : accroche en haut au début, gros texte de la scène en haut,
// sous-titres mot à mot dans le style choisi (mot prononcé en couleur, mots
// forts dans une seconde couleur, petit rebond), appel à l'action à la fin.
export function sousTitresMontage(plan: PlanMontage, d: number[]) {
  const st = PARAMS_SOUS_TITRES[plan.sous_titres ?? "karaoke"];
  const casse = (m: string) => (st.majuscules ? m.toUpperCase() : m);
  const flou = st.flou ? `\\blur${st.flou}` : "";
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
    for (const g of groupes(mots, st.maxMots)) {
      g.forEach((m, j) => {
        const finMot = j === g.length - 1 ? m.fin : g[j + 1].debut;
        const ligne = g
          .map((x, n) => {
            const mot = casse(x.mot);
            if (n === j) return `{\\1c${st.accentAss}}${mot}{\\1c&HFFFFFF&}`;
            return forts.has(sansAccent(x.mot)) ? `{\\1c${st.fortAss}}${mot}{\\1c&HFFFFFF&}` : mot;
          })
          .join(" ");
        const rebond = j === 0 ? "\\fscx118\\fscy118\\t(0,100,\\fscx100\\fscy100)" : "";
        dial(1, m.debut, finMot, "Mots", `{${rebond}${flou}}${ligne}`);
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
Style: Mots,DejaVu Sans,${st.taille},&H00FFFFFF,&H00FFFFFF,${st.contourAss},${st.fondAss},-1,0,0,0,100,100,0,0,${st.bordure},${st.contour},${st.ombre},${st.alignement},50,50,${st.margeV},1
Style: Titre,DejaVu Sans,44,&H00111111,&H00111111,&H00FFFFFF,&H00000000,-1,0,0,0,100,100,0,0,3,14,0,8,60,60,150,1
Style: Accroche,DejaVu Sans,52,&H00FFFFFF,&H00FFFFFF,&H000000E0,&H00000000,-1,0,0,0,100,100,0,0,3,18,0,8,50,50,140,1
Style: Cta,DejaVu Sans,54,&H00111111,&H00111111,&H0000D7FF,&H00000000,-1,0,0,0,100,100,0,0,3,18,0,2,60,60,${margeCta(st)},1

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
  mouvement: "",
  choix: null,
  apercu: null,
  vitesse: 1,
  media_url: null,
  media_type: null,
});

// --- Modèles en un clic --------------------------------------------------------------

export const MODELES = [
  { id: "viral", nom: "Viral TikTok", description: "Gros sous-titres verts, couleurs vives, coupes rapides et whoosh." },
  { id: "pro", nom: "Pro LinkedIn", description: "Sous-titres sobres, look cinéma, fondus, pas d'emoji ni de bruitage." },
  { id: "dynamique", nom: "Dynamique", description: "Karaoké jaune, glissements et pops à chaque scène." },
  { id: "cinematique", nom: "Cinématique", description: "Look cinéma, zooms lents, fondus, musique plus présente." },
  { id: "neon", nom: "Néon nuit", description: "Sous-titres néon, tons froids, flashs." },
] as const;
export type Modele = Ids<typeof MODELES>;

// Applique un modèle à tout le plan (style, filtre, effets, transitions, sons),
// sans toucher aux phrases ni aux images choisies.
export function appliquerModele(plan: PlanMontage, modele: Modele): PlanMontage {
  const alterne = <T,>(i: number, l: T[]) => l[i % l.length];
  const regle: Record<Modele, Pick<PlanMontage, "sous_titres" | "filtre" | "mix"> & { scene: (s: SceneMontage, i: number) => Partial<SceneMontage> }> = {
    viral: {
      sous_titres: "viral",
      filtre: "vif",
      mix: { voix: 1, musique: 1, effets: 1.2 },
      scene: (_, i) => ({
        effet: i === 0 ? "secousse" : alterne<Effet>(i, ["zoom_avant", "zoom_arriere", "zoom_avant", "flash"]),
        transition: i % 3 === 2 ? "zoom" : "coupe",
        son: i % 3 === 2 || i === 0 ? "whoosh" : "pop",
      }),
    },
    pro: {
      sous_titres: "sobre",
      filtre: "cinema",
      mix: { voix: 1, musique: 0.8, effets: 0 },
      scene: () => ({ effet: "zoom_avant", transition: "fondu", son: "aucun", emoji: "" }),
    },
    dynamique: {
      sous_titres: "karaoke",
      filtre: "aucun",
      mix: { voix: 1, musique: 1, effets: 1 },
      scene: (_, i) => ({ effet: alterne<Effet>(i, ["zoom_avant", "zoom_arriere"]), transition: "glissement", son: "pop" }),
    },
    cinematique: {
      sous_titres: "sobre",
      filtre: "cinema",
      mix: { voix: 1, musique: 1.6, effets: 0.6 },
      scene: (_, i) => ({ effet: alterne<Effet>(i, ["zoom_arriere", "zoom_avant"]), transition: "fondu", son: i === 0 ? "whoosh" : "aucun" }),
    },
    neon: {
      sous_titres: "neon",
      filtre: "froid",
      mix: { voix: 1, musique: 1.2, effets: 1 },
      scene: (_, i) => ({ effet: i % 2 ? "flash" : "zoom_avant", transition: i % 2 ? "flash" : "coupe", son: i % 2 ? "whoosh" : "aucun" }),
    },
  };
  const r = regle[modele];
  return { ...plan, sous_titres: r.sous_titres, filtre: r.filtre, mix: r.mix, scenes: plan.scenes.map((s, i) => ({ ...s, ...r.scene(s, i) })) };
}

// Modèle des vidéos automatiques selon le réseau : TikTok, Instagram et les
// Shorts récompensent le rythme viral ; Facebook, un montage plus posé ;
// LinkedIn, le style pro.
export function modelePour(plateforme: string | null | undefined): Modele {
  if (plateforme === "facebook") return "dynamique";
  if (plateforme === "linkedin") return "pro";
  return "viral";
}

// Durée estimée de chaque scène pour l'aperçu en direct (avant la vraie voix
// off) : environ 2,6 mots par seconde, au moins 1,5 s.
export const dureesEstimees = (scenes: { phrase: string }[]) =>
  scenes.map((s) => Math.round(Math.max(1.5, s.phrase.split(/\s+/).filter(Boolean).length / 2.6 + 0.3) * 100) / 100);

// Plan prêt à monter : au moins 2 scènes avec une phrase.
export function planValide(plan: PlanMontage) {
  const pleines = plan.scenes.filter((s) => s.phrase.trim());
  if (pleines.length < 2) return "Il faut au moins 2 scènes avec une phrase.";
  if (pleines.length > 12) return "12 scènes au maximum.";
  return null;
}

// Mot à faire ressortir (mots forts de la scène), accents et ponctuation ignorés.
export const estMotFort = (s: Pick<SceneMontage, "mots_forts">, mot: string) =>
  s.mots_forts.flatMap((m) => m.split(" ")).map(sansAccent).includes(sansAccent(mot));

// Ce que montre l'aperçu en direct à l'instant t : la scène, sa progression,
// le groupe de mots affiché et le mot prononcé, l'accroche ou l'appel à l'action.
export function etatApercu(plan: PlanMontage, d: number[], t: number) {
  const debuts = debutsScenes(d);
  const total = d.reduce((a, b) => a + b, 0);
  const x = Math.min(Math.max(0, t), Math.max(0, total - 0.001));
  let i = 0;
  while (i < d.length - 1 && debuts[i + 1] <= x) i++;
  const scene = plan.scenes[i];
  const local = x - debuts[i];
  const st = PARAMS_SOUS_TITRES[plan.sous_titres ?? "karaoke"];
  const gs = scene ? groupes(motsMinutes(scene.phrase, debuts[i], d[i]), st.maxMots) : [];
  const groupe = gs.find((g) => x >= g[0].debut && x < g[g.length - 1].fin) ?? gs[gs.length - 1] ?? [];
  return {
    i,
    local,
    progres: d[i] ? Math.min(1, local / d[i]) : 0,
    total,
    mots: groupe.map((m) => m.mot),
    actif: groupe.findIndex((m) => x >= m.debut && x < m.fin),
    accroche: Boolean(plan.accroche) && x < Math.min(2.6, (d[0] ?? 0) + 0.5),
    cta: Boolean(plan.cta) && i === d.length - 1,
  };
}
