import { z } from "zod";
import { ACCENT_DEFAUT, couleurAss, texteSurCouleur } from "./couleurs";
import type { StyleVideo } from "./styles";
import { decorMarche, estEtranger, marcheDe, phraseDecouvrir, reglesMarche } from "./marches";

// Vidéo courte verticale (TikTok, Reels, Shorts) : script, minutage et
// sous-titres. Fonctions pures, testables.

const texte = z.string().catch("").transform((x) => x.trim());

const schemaScript = z.object({
  titre: texte,
  scenes: z
    .array(
      z.object({
        texte_ecran: texte,
        voix: texte,
        visuel: texte,
        recherche_stock: texte,
        // « produit » : la scène montre l'application elle-même (captures du site).
        type_visuel: z.enum(["produit", "terrain"]).catch("terrain"),
        // Repère affiché selon le style : numéro d'étape, rang du top 3,
        // « AVANT » / « APRÈS ». Vide pour les autres styles.
        repere: texte,
      }),
    )
    .catch([])
    .transform((l) =>
      l
        .filter((s) => s.voix || s.texte_ecran)
        .slice(0, 8)
        .map((s) => ({ ...s, texte_ecran: raccourcir(s.texte_ecran || s.voix) })),
    ),
  legende: texte,
});

export type ScriptVideo = z.infer<typeof schemaScript>;

// Texte à l'écran : 6 mots au plus, sans couper une idée. On garde la
// première proposition (jusqu'à la virgule ou aux deux-points) si elle est
// courte, sinon les premiers mots jusqu'à un mot porteur.
export function raccourcir(texte: string, max = 6) {
  const propre = texte.replace(/\s+/g, " ").trim().replace(/[.!?…;:,]+$/, "");
  const mots = propre.split(" ");
  if (mots.length <= max) return propre;
  const vides = /^(de|des|du|la|le|les|l'|d'|un|une|et|ou|à|au|aux|en|pour|par|sur|avec|sans|pas|votre|vos|son|sa|ses|ce|cette|qui|que|dans)$/i;
  const complement = /^(avec|pour|sur|dans|en|à|au|aux|par|chez|grâce|selon)\b/i;
  const nbMots = (x: string) => x.split(" ").length;
  const clauses = propre.split(/\s*[,:;–—]\s*|\s-\s/).filter(Boolean);
  // Une proposition courte qui porte l'idée (pas un simple complément comme
  // « Avec BTP Ecosystem »).
  const pleine = clauses.find((c) => nbMots(c) >= 2 && nbMots(c) <= max && !complement.test(c));
  if (pleine) return pleine.charAt(0).toUpperCase() + pleine.slice(1);
  const base = (clauses.find((c) => !complement.test(c)) ?? propre).split(" ");
  let coupe = base.slice(0, max);
  if (base.length > max) {
    // Coupe à la conjonction (« Gagnez du temps et… ») ou avant le dernier mot
    // de liaison (« …complet à partir ») pour ne pas laisser d'idée à moitié.
    const conj = coupe.findIndex((m, j) => j >= 2 && /^(et|ou|mais)$/i.test(m));
    if (conj !== -1) coupe = coupe.slice(0, conj);
    else
      for (let j = coupe.length - 1; j >= 3; j--) {
        if (vides.test(coupe[j])) {
          coupe = coupe.slice(0, j);
          break;
        }
      }
  }
  while (coupe.length > 2 && vides.test(coupe[coupe.length - 1])) coupe = coupe.slice(0, -1);
  const r = coupe.join(" ");
  return r.charAt(0).toUpperCase() + r.slice(1);
}

export function consigneScript(
  t: { titre: string; consigne: string },
  contexte: string | null,
  plateforme: string,
  avecCaptures = false,
  style: StyleVideo = "classique",
  marche?: string | null,
) {
  // Marché étranger : script, textes à l'écran et légende dans sa langue.
  const langue = reglesMarche(marche) ? `\n${reglesMarche(marche)}\n- Champs « visuel » et « recherche_stock » (en anglais) : ${decorMarche(marche)}` : "";
  if (style !== "classique") return consigneScriptStyle(t, contexte, plateforme, avecCaptures, style, marche) + langue;
  return `Écris le script d'une vidéo verticale de 30 à 45 secondes pour ${plateforme}, en ${marcheDe(marche).langue}.
Sujet : ${t.titre}
${t.consigne ? `Consigne : ${t.consigne}\n` : ""}${contexte ? `\nFiche de la marque (source de vérité, n'invente aucun fait, chiffre ni témoignage) :\n${contexte}\n` : ""}
Structure : scène 1 = accroche forte qui arrête le défilement ; scènes du milieu = un problème concret du client puis la fonctionnalité réelle de la marque qui le résout ; dernière scène = appel à l'action avec le nom de la marque.
Images : chaque scène « terrain » montre la clientèle visée DANS SON VRAI MÉTIER (son décor, ses outils, ses gestes), avec des mots-clés DIFFÉRENTS à chaque scène. Jamais de bureau générique, de papiers ou de personne stressée, sauf pour la scène qui montre le problème.
${
  avecCaptures
    ? "De vraies captures d'écran du produit sont disponibles : mets type_visuel \"produit\" sur 1 ou 2 scènes qui présentent la fonctionnalité, et sur la dernière scène. Toutes les autres : \"terrain\"."
    : "Mets type_visuel \"terrain\" sur toutes les scènes."
}
Réponds UNIQUEMENT par un objet JSON valide :
{"titre": "titre court", "scenes": [{"texte_ecran": "4 à 6 mots formant une idée complète, jamais coupée", "voix": "1 à 2 phrases parlées, naturelles", "type_visuel": "terrain ou produit", "visuel": "English prompt: realistic vertical photo of the scene, the niche's real setting and people, no text", "recherche_stock": "2 to 4 English keywords for a real stock video of this exact moment (e.g. construction worker smartphone site)"}], "legende": "texte du post qui accompagne la vidéo, avec l'appel à l'action, le lien du site et 3 à 5 hashtags"}
Entre 5 et 7 scènes.${langue}`;
}

export function lireScript(reponse: string): ScriptVideo | null {
  const debut = reponse.indexOf("{");
  const fin = reponse.lastIndexOf("}");
  if (debut === -1 || fin <= debut) return null;
  try {
    const s = schemaScript.parse(JSON.parse(reponse.slice(debut, fin + 1)));
    return s.scenes.length >= 3 ? s : null;
  } catch {
    return null;
  }
}

// Durée de chaque scène : proportionnelle au texte parlé, pour suivre la voix
// off ; bornée pour garder du rythme.
export function durees(scenes: { voix: string; texte_ecran: string }[], total?: number) {
  const poids = scenes.map((s) => Math.max(8, (s.voix || s.texte_ecran).length));
  const somme = poids.reduce((a, b) => a + b, 0);
  const cible = total ?? Math.min(45, Math.max(24, somme / 14)); // ~14 caractères par seconde
  return poids.map((p) => Math.round(Math.min(10, Math.max(2.5, (p / somme) * cible)) * 100) / 100);
}

const horodatage = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = (s % 60).toFixed(2).padStart(5, "0");
  return `${h}:${String(m).padStart(2, "0")}:${sec}`;
};

const echapperAss = (t: string) => t.replace(/[{}\\]/g, "").replace(/\n/g, "\\N");

const stylePrincipal = (largeur: number, hauteur: number) =>
  `Style: Principal,DejaVu Sans,${Math.round(largeur * 0.075)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,${Math.round(largeur * 0.008)},2,2,60,60,${Math.round(hauteur * 0.22)},1`;

function documentAss(largeur: number, hauteur: number, styles: string[], lignes: string[]) {
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${largeur}
PlayResY: ${hauteur}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${styles.join("\n")}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${lignes.join("\n")}
`;
}

// Début de chaque scène sur la frise.
const debuts = (d: number[]) => d.map((_, i) => d.slice(0, i).reduce((a, b) => a + b, 0));

const lignesPrincipales = (scenes: { texte_ecran: string }[], d: number[]) =>
  debuts(d).map(
    (debut, i) =>
      `Dialogue: 0,${horodatage(debut)},${horodatage(debut + d[i])},Principal,,0,0,0,,{\\fad(150,150)}${echapperAss(scenes[i].texte_ecran.toUpperCase())}`,
  );

// Sous-titres stylés (ASS) : gros texte blanc cerné de noir, au centre-bas.
export function sousTitresAss(scenes: { texte_ecran: string }[], d: number[], largeur: number, hauteur: number) {
  return documentAss(largeur, hauteur, [stylePrincipal(largeur, hauteur)], lignesPrincipales(scenes, d));
}

// --- Styles de vidéo ------------------------------------------------------------

type StyleAvecConsigne = Exclude<StyleVideo, "classique">;

const FORMATS_SCRIPT: Record<StyleAvecConsigne, { duree: string; structure: string; images: string; scenes: string }> = {
  ugc: {
    duree: "20 à 35 secondes",
    structure: `Format UGC : contenu « face caméra » façon TikTok, filmé comme au téléphone. La voix parle à la 1re personne (« je », « on »), comme quelqu'un de l'équipe de la marque qui partage une astuce à un ami : langage parlé et naturel, phrases de 12 mots au plus, aucune formule publicitaire.
Scène 1 = accroche dans la toute première seconde : « POV : … », « Personne ne vous dit ça, mais… » ou une question choc ; son texte_ecran reprend cette accroche. Scènes du milieu = le problème vécu, puis l'astuce concrète, une idée par scène. Dernière scène = appel à l'action naturel, avec le nom de la marque.
Interdit : se présenter comme un client, inventer un témoignage, un avis ou une expérience vécue. Aucune fausse personne.`,
    images: "Images : plans filmés à la main, en point de vue subjectif (mains, outils, écran du téléphone, décor du métier), jamais de visage en gros plan.",
    scenes: "Entre 6 et 8 scènes courtes (1 phrase de voix chacune).",
  },
  avant_apres: {
    duree: "25 à 40 secondes",
    structure: `Format « avant / après ». Scène 1 = accroche qui annonce la transformation. Puis 1 à 2 scènes AVANT (repere "AVANT") : la situation de départ, le problème, montré concrètement. Puis 2 à 3 scènes APRÈS (repere "APRÈS") : le résultat obtenu grâce à l'offre réelle de la marque. Dernière scène = appel à l'action avec le nom de la marque.
Les images AVANT et APRÈS montrent le même lieu ou le même objet dans deux états (ex. « old damaged bathroom » puis « modern renovated bathroom »). Ce sont des illustrations : ne les présente jamais comme le chantier ou le client réel de la marque.`,
    images: "Images : chaque scène montre concrètement l'état décrit, dans le vrai décor du métier de la clientèle visée.",
    scenes: "Entre 5 et 7 scènes.",
  },
  etapes: {
    duree: "30 à 45 secondes",
    structure: `Format tutoriel en étapes. Scène 1 = accroche qui promet un résultat concret (ex. « Comment … en 3 étapes »). Puis 3 à 5 scènes, une par étape, dans l'ordre (repere "1", "2", "3"…) : texte_ecran = l'action de l'étape, commençant par un verbe à l'impératif ; voix = comment faire, concrètement. Dernière scène = appel à l'action avec le nom de la marque.`,
    images: "Images : chaque étape montre le geste ou l'écran correspondant, dans le vrai décor du métier de la clientèle visée, avec des mots-clés DIFFÉRENTS à chaque scène.",
    scenes: "Entre 5 et 7 scènes.",
  },
  top3: {
    duree: "25 à 40 secondes",
    structure: `Format « top 3 » en compte à rebours. Scène 1 = accroche (ex. « 3 erreurs qui … » ou « 3 raisons de … »). Puis exactement 3 scènes, de la n°3 à la n°1 (repere "3", "2", "1"), la plus forte en dernier. Dernière scène = appel à l'action avec le nom de la marque.`,
    images: "Images : chaque point montre une situation concrète de la clientèle visée, avec des mots-clés DIFFÉRENTS à chaque scène.",
    scenes: "Exactement 5 scènes.",
  },
};

function consigneScriptStyle(t: { titre: string; consigne: string }, contexte: string | null, plateforme: string, avecCaptures: boolean, style: StyleAvecConsigne, marche?: string | null) {
  const f = FORMATS_SCRIPT[style];
  return `Écris le script d'une vidéo verticale de ${f.duree} pour ${plateforme}, en ${marcheDe(marche).langue}.
Sujet : ${t.titre}
${t.consigne ? `Consigne : ${t.consigne}\n` : ""}${contexte ? `\nFiche de la marque (source de vérité, n'invente aucun fait, chiffre ni témoignage) :\n${contexte}\n` : ""}
${f.structure}
${f.images}
${
  avecCaptures
    ? "De vraies captures d'écran du produit sont disponibles : mets type_visuel \"produit\" sur 1 scène qui présente la fonctionnalité, et sur la dernière scène. Toutes les autres : \"terrain\"."
    : "Mets type_visuel \"terrain\" sur toutes les scènes."
}
Réponds UNIQUEMENT par un objet JSON valide :
{"titre": "titre court", "scenes": [{"repere": "${style === "ugc" ? "vide" : "vide pour l'accroche et l'appel à l'action, sinon le repère du format"}", "texte_ecran": "4 à 6 mots formant une idée complète, jamais coupée", "voix": "1 à 2 phrases parlées, naturelles", "type_visuel": "terrain ou produit", "visuel": "English prompt: realistic vertical photo of the scene, the niche's real setting, no text", "recherche_stock": "2 to 4 English keywords for a real stock video of this exact moment"}], "legende": "texte du post qui accompagne la vidéo, avec l'appel à l'action, le lien du site et 3 à 5 hashtags"}
${f.scenes}`;
}

// Repères imposés selon le style, quelle que soit la réponse de l'IA (ou le
// script de secours) : numéros d'étapes, compte à rebours 3-2-1, AVANT puis
// APRÈS. L'accroche (1re scène) et l'appel à l'action (dernière) n'en ont pas.
export function normaliserScript(script: ScriptVideo, style: StyleVideo): ScriptVideo {
  const scenes = script.scenes.map((s) => ({ ...s, repere: "" }));
  if (scenes.length < 3 || style === "classique" || style === "ugc") return { ...script, scenes };
  const premiere = scenes[0];
  const derniere = scenes[scenes.length - 1];
  let milieu = scenes.slice(1, -1);
  if (style === "top3") {
    milieu = milieu.slice(0, 3);
    milieu.forEach((s, i) => (s.repere = String(milieu.length - i)));
  } else if (style === "etapes") {
    milieu.forEach((s, i) => (s.repere = String(i + 1)));
  } else {
    const m = milieu.length;
    let nbAvant = script.scenes.slice(1, -1).filter((s) => /^avant/i.test(s.repere)).length;
    if (nbAvant === 0 || nbAvant >= m) nbAvant = Math.max(1, Math.ceil(m / 2) - (m % 2 === 0 ? 0 : 1));
    if (m === 1) premiere.repere = "AVANT";
    milieu.forEach((s, i) => (s.repere = m > 1 && i < nbAvant ? "AVANT" : "APRÈS"));
  }
  return { ...script, scenes: [premiere, ...milieu, derniere] };
}

// Indice de la première scène « APRÈS » qui suit une scène « AVANT » : c'est
// là que se place la transition. -1 s'il n'y en a pas.
export function indexTransition(reperes: string[]) {
  return reperes.findIndex((r, i) => i > 0 && r === "APRÈS" && reperes[i - 1] === "AVANT");
}

// Plans « saccadés » du style UGC : la scène est découpée en coupes de 1,5 à
// 2,5 s environ (jump cuts), chacune cadrée différemment.
export function coupesSaccadees(duree: number): [number, number][] {
  const n = Math.max(1, Math.round(duree / 2));
  const pas = duree / n;
  return Array.from({ length: n }, (_, i) => [Math.round(i * pas * 100) / 100, i === n - 1 ? duree : Math.round((i + 1) * pas * 100) / 100]);
}

export type MotMinute = { mot: string; debut: number; fin: number };

// Minutage de chaque mot d'une phrase parlée entre `debut` et `debut + duree` :
// proportionnel à sa longueur, avec une petite pause après la ponctuation.
export function minutageMots(texte: string, debut: number, duree: number): MotMinute[] {
  const mots = texte.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!mots.length) return [];
  const poids = mots.map((m) => m.length + 2 + (/[.!?…,;:]$/.test(m) ? 3 : 0));
  const somme = poids.reduce((a, b) => a + b, 0);
  let t = debut;
  return mots.map((mot, i) => {
    const fin = i === mots.length - 1 ? debut + duree : t + (duree * poids[i]) / somme;
    const r = { mot, debut: Math.round(t * 100) / 100, fin: Math.round(fin * 100) / 100 };
    t = fin;
    return r;
  });
}

// Groupes de 1 à `max` mots affichés ensemble ; un groupe se ferme à la
// ponctuation ou quand il devient trop long pour une ligne.
export function groupesDeMots(mots: string[], max = 3, maxCaracteres = 16) {
  const groupes: string[][] = [];
  let courant: string[] = [];
  for (const mot of mots) {
    const longueur = courant.join(" ").length;
    if (courant.length && longueur + 1 + mot.length > maxCaracteres) {
      groupes.push(courant);
      courant = [];
    }
    courant.push(mot);
    if (courant.length >= max || /[.!?…,;:]$/.test(mot)) {
      groupes.push(courant);
      courant = [];
    }
  }
  if (courant.length) groupes.push(courant);
  return groupes;
}

// Sous-titres « mot à mot » (style UGC) : 2 à 3 mots gros et centrés, cernés
// de noir, le mot prononcé surligné dans la couleur d'accent. L'accroche de
// la 1re scène s'affiche en haut, dans un encart blanc.
export function sousTitresMotAMot(
  scenes: { texte_ecran: string; voix?: string }[],
  d: number[],
  largeur: number,
  hauteur: number,
  accent = ACCENT_DEFAUT,
) {
  const styles = [
    `Style: Mots,DejaVu Sans,${Math.round(largeur * 0.08)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H99000000,-1,0,0,0,100,100,0,0,1,${Math.round(largeur * 0.011)},3,5,50,50,0,1`,
    `Style: Accroche,DejaVu Sans,${Math.round(largeur * 0.06)},&H00111111,&H00111111,&H00FFFFFF,&H00000000,-1,0,0,0,100,100,0,0,3,${Math.round(largeur * 0.022)},0,8,60,60,${Math.round(hauteur * 0.1)},1`,
  ];
  // Couleur en ligne (\\1c) : &HBBGGRR&, sans l'alpha.
  const surligne = `&H${couleurAss(accent).slice(4)}&`;
  const pos = `\\an5\\pos(${Math.round(largeur / 2)},${Math.round(hauteur * 0.64)})`;
  const lignes: string[] = [];
  debuts(d).forEach((debut, i) => {
    const s = scenes[i];
    if (i === 0 && s.texte_ecran) {
      lignes.push(`Dialogue: 1,${horodatage(debut)},${horodatage(debut + d[i])},Accroche,,0,0,0,,{\\fad(80,120)}${echapperAss(s.texte_ecran)}`);
    }
    const minutage = minutageMots(s.voix || s.texte_ecran, debut, d[i]);
    let k = 0;
    for (const groupe of groupesDeMots(minutage.map((m) => m.mot))) {
      const mots = minutage.slice(k, k + groupe.length);
      mots.forEach((m, j) => {
        const fin = j === mots.length - 1 ? m.fin : mots[j + 1].debut;
        const texte = mots
          .map((x, n) => {
            const mot = echapperAss(x.mot.toUpperCase());
            return n === j ? `{\\1c${surligne}}${mot}{\\1c&HFFFFFF&}` : mot;
          })
          .join(" ");
        const pop = j === 0 ? "\\fscx114\\fscy114\\t(0,90,\\fscx100\\fscy100)" : "";
        lignes.push(`Dialogue: 0,${horodatage(m.debut)},${horodatage(fin)},Mots,,0,0,0,,{${pos}${pop}}${texte}`);
      });
      k += groupe.length;
    }
  });
  return documentAss(largeur, hauteur, styles, lignes);
}

// Sous-titres selon le style : texte à l'écran au centre-bas (comme le style
// classique) plus le repère de chaque scène (gros numéro, rang du top 3,
// badge AVANT / APRÈS) dans un encart de couleur.
export function sousTitresStyle(
  style: StyleVideo,
  scenes: { texte_ecran: string; voix?: string; repere?: string }[],
  d: number[],
  largeur: number,
  hauteur: number,
  accent = ACCENT_DEFAUT,
  marche?: string | null,
) {
  if (style === "classique") return sousTitresAss(scenes, d, largeur, hauteur);
  const mots = marcheDe(marche).mots;
  if (style === "ugc") return sousTitresMotAMot(scenes, d, largeur, hauteur, accent);
  const encre = couleurAss(texteSurCouleur(accent));
  const fond = couleurAss(accent);
  const grand = style === "avant_apres" ? 0.08 : 0.19;
  const styles = [
    stylePrincipal(largeur, hauteur),
    `Style: Repere,DejaVu Sans,${Math.round(largeur * grand)},${encre},${encre},${fond},&H00000000,-1,0,0,0,100,100,0,0,3,${Math.round(largeur * 0.028)},0,7,0,0,0,1`,
    `Style: Avant,DejaVu Sans,${Math.round(largeur * grand)},&H00FFFFFF,&H00FFFFFF,${couleurAss("#3A3F47")},&H00000000,-1,0,0,0,100,100,0,0,3,${Math.round(largeur * 0.028)},0,7,0,0,0,1`,
    `Style: Etiquette,DejaVu Sans,${Math.round(largeur * 0.05)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,${Math.round(largeur * 0.006)},2,7,0,0,0,1`,
  ];
  const lignes = lignesPrincipales(scenes, d);
  const total = scenes.filter((s) => s.repere).length;
  const x = Math.round(largeur * 0.08);
  const y = Math.round(hauteur * 0.08);
  debuts(d).forEach((debut, i) => {
    const r = scenes[i].repere;
    if (!r) return;
    const quand = `${horodatage(debut)},${horodatage(debut + d[i])}`;
    if (style === "avant_apres") {
      const nom = r === "AVANT" ? "Avant" : "Repere";
      // Repère affiché dans la langue du marché (« PRIMA », « DOPO »…).
      const affiche = r === "AVANT" ? mots.avant : r === "APRÈS" ? mots.apres : r;
      lignes.push(`Dialogue: 1,${quand},${nom},,0,0,0,,{\\pos(${x},${y})\\fad(120,0)\\fscx120\\fscy120\\t(0,140,\\fscx100\\fscy100)}${echapperAss(affiche)}`);
      return;
    }
    if (style === "etapes") {
      // Le numéro glisse depuis la gauche ; « ÉTAPE 1/3 » en dessous.
      lignes.push(`Dialogue: 1,${quand},Repere,,0,0,0,,{\\move(${-largeur * 0.3},${y},${x},${y},0,220)\\fad(0,120)}${echapperAss(r)}`);
      lignes.push(`Dialogue: 1,${quand},Etiquette,,0,0,0,,{\\pos(${x},${Math.round(y + largeur * 0.3)})\\fad(200,120)}${mots.etape} ${echapperAss(r)}/${total}`);
      return;
    }
    // Top 3 : « #3 » centré en haut, qui apparaît en grossissant.
    lignes.push(
      `Dialogue: 1,${quand},Repere,,0,0,0,,{\\an8\\pos(${Math.round(largeur / 2)},${y})\\fscx160\\fscy160\\t(0,180,\\fscx100\\fscy100)\\fad(0,120)}#${echapperAss(r)}`,
    );
  });
  return documentAss(largeur, hauteur, styles, lignes);
}

// Script construit sans IA à partir du texte de la publication : utilisé
// quand les IA gratuites sont saturées, pour que la vidéo se fasse quand même.
// Marché étranger : le titre interne (en français) n'apparaît pas ; tout vient
// du texte de la publication, déjà écrit dans la langue du marché.
export function scriptDeSecours(t: { titre: string; consigne: string; brouillon?: string | null }, contexte: string | null, marche?: string | null): ScriptVideo {
  if (estEtranger(marche) && t.brouillon) {
    const local = t.brouillon.split(/(?<=[.!?])\s+|\n+/).find((p) => p.replace(/[#@]\S+/g, "").trim().length >= 12) ?? t.brouillon;
    t = { titre: local.replace(/#\S+/g, "").trim().slice(0, 120), consigne: "", brouillon: t.brouillon };
  }
  const ligne = (etiquette: string) => contexte?.match(new RegExp(`${etiquette}[^:\\n]*: (.+)`))?.[1]?.trim() ?? "";
  const marque = ligne("Marque");
  const lien = ligne("Site / lien").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const source = (t.brouillon || t.consigne || t.titre)
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/#[\p{L}\d_]+/gu, " ")
    .replace(/[*_`>]+/g, " ")
    .replace(/\p{Extended_Pictographic}/gu, " ");
  const phrases = source
    .split(/(?<=[.!?])\s+|\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length >= 20 && p.toLowerCase() !== t.titre.toLowerCase())
    .map((p) => (p.length > 170 ? `${p.slice(0, 167).replace(/\s\S*$/, "")}…` : p))
    .slice(0, 5);
  // Mots-clés d'images : l'univers visuel de la fiche marque, un par scène,
  // pour ne jamais montrer deux fois la même séquence.
  const univers = ligne("Univers visuel")
    .split(/[,;/]|\bet\b/)
    .map((m) => m.replace(/[^\p{L}\d\s'-]/gu, " ").replace(/\s+/g, " ").trim())
    .filter((m) => m.length > 3);
  const cle = t.titre.replace(/[^\p{L}\d\s-]/gu, " ").replace(/\s+/g, " ").trim();
  const motsCles = univers.length ? univers : [cle];
  const recherche = (i: number) => motsCles[i % motsCles.length];

  const scenes: ScriptVideo["scenes"] = [
    { texte_ecran: raccourcir(t.titre), voix: phrases[0] ?? t.titre, visuel: t.titre, recherche_stock: recherche(0), type_visuel: "terrain", repere: "" },
    ...phrases.slice(1).map((p, i) => ({
      texte_ecran: raccourcir(p),
      voix: p,
      visuel: p,
      recherche_stock: recherche(i + 1),
      type_visuel: (i === 0 ? "produit" : "terrain") as "produit" | "terrain",
      repere: "",
    })),
  ];
  while (scenes.length < 3) {
    const i = scenes.length;
    scenes.push({ texte_ecran: raccourcir(t.consigne || t.titre), voix: t.consigne || t.titre, visuel: t.titre, recherche_stock: recherche(i), type_visuel: "terrain", repere: "" });
  }
  scenes.push({
    texte_ecran: marque || marcheDe(marche).mots.essayer,
    voix: estEtranger(marche)
      ? phraseDecouvrir(marche, marque, lien)
      : `${marque ? `Découvrez ${marque}` : "Découvrez-le"}${lien ? ` sur ${lien}` : ""}.`,
    visuel: t.titre,
    recherche_stock: recherche(scenes.length),
    type_visuel: "produit",
    repere: "",
  });
  return { titre: t.titre, scenes: scenes.slice(0, 8), legende: t.brouillon || t.titre };
}

// Avec des captures du produit : au moins une scène du milieu et la dernière
// les montrent, trois au plus (le reste montre la clientèle au travail).
export function imposerScenesProduit(script: ScriptVideo): ScriptVideo {
  const n = script.scenes.length;
  const scenes = script.scenes.map((s, i) => ({ ...s, type_visuel: i === n - 1 ? ("produit" as const) : s.type_visuel }));
  // Une scène « AVANT » montre la situation de départ, jamais le produit.
  for (const s of scenes) if (s.repere === "AVANT") s.type_visuel = "terrain";
  const milieu = scenes.slice(1, -1);
  if (!milieu.some((s) => s.type_visuel === "produit") && n >= 3) {
    const m = Math.floor(n / 2);
    const cible = scenes[m].repere === "AVANT" ? scenes.findIndex((s, j) => j > m && j < n - 1) : m;
    if (cible > 0) scenes[cible].type_visuel = "produit";
  }
  let produits = 0;
  for (const s of scenes) if (s.type_visuel === "produit" && ++produits > 3) s.type_visuel = "terrain";
  if (scenes[n - 1].type_visuel !== "produit") scenes[n - 1].type_visuel = "produit";
  return { ...script, scenes };
}
