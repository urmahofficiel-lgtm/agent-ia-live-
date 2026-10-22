import { z } from "zod";
import { marcheDe, reglesMarche } from "./marches";
import { JARGON } from "./croissance";

// Carrousel : 5 à 8 diapositives à faire défiler (Instagram, TikTok en photos,
// LinkedIn en document PDF). Le format qui fait le plus enregistrer et
// partager : une idée par diapositive, lisible sans le son. Logique pure :
// consigne pour l'IA, lecture de sa réponse, dessin de chaque diapositive
// (script de sous-titres ASS rendu par ffmpeg en 1080 × 1350).

export const LARGEUR_DIAPO = 1080;
export const HAUTEUR_DIAPO = 1350;

export type Diapo = { titre: string; texte: string };
export type Carrousel = { diapos: Diapo[] };

export function consigneCarrousel(
  t: { titre: string; consigne: string; brouillon: string; plateforme: string },
  contexte: string | null,
  marche?: string | null,
) {
  return `Tu crées un carrousel ${t.plateforme === "linkedin" ? "LinkedIn (document à feuilleter)" : "Instagram / TikTok (photos à faire glisser)"} en ${marcheDe(marche).langue}, à partir de ce post.

Sujet : ${t.titre}
Consigne : ${t.consigne}

Texte du post (même message, source de vérité) :
${t.brouillon}
${contexte ? `\nFiche de la marque (source de vérité, n'invente aucun chiffre, prix, client ni témoignage) :\n${contexte.slice(0, 3000)}\n` : ""}
Règles :
- 6 à 8 diapositives : la 1re est la couverture, la dernière l'appel à l'engagement.
- Couverture : « titre » = accroche de 3 à 7 mots qui donne envie de glisser (un chiffre, une erreur, une promesse concrète), « texte » = sous-titre de 8 mots au plus.
- Diapositives du milieu : UNE idée chacune. « titre » de 2 à 6 mots, « texte » de 1 à 2 phrases courtes (180 caractères au plus), concrètes, dans les mots du terrain.
- Dernière diapositive : « titre » = l'appel à l'engagement (« Enregistre-le pour ton prochain chantier », « Et toi, tu fais comment ? »…), « texte » = une phrase.
- Jamais de jargon technique (${JARGON.slice(0, 8).join(", ")}…), pas d'emoji, pas de hashtag, pas de lien.
- Si la consigne dit « Post sans publicité », aucune diapositive ne nomme la marque ni un produit.
Réponds UNIQUEMENT par un objet JSON valide :
{"diapos": [{"titre": "...", "texte": "..."}]}${reglesMarche(marche) ? `\n${reglesMarche(marche)}` : ""}`;
}

const schema = z.object({
  diapos: z.array(z.object({ titre: z.string().catch(""), texte: z.string().catch("") }).catch({ titre: "", texte: "" })).catch([]),
});

const propre = (s: string, max: number) =>
  s
    .replace(/[*_#`]/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

// Réponse de l'IA → diapositives (5 à 10), ou null si inutilisable.
export function lireCarrousel(reponse: string): Carrousel | null {
  const json = reponse.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  let brut: unknown;
  try {
    brut = JSON.parse(json);
  } catch {
    return null;
  }
  const diapos = schema
    .parse(brut)
    .diapos.map((d) => ({ titre: propre(d.titre, 90), texte: propre(d.texte, 220) }))
    .filter((d) => d.titre);
  return diapos.length >= 5 ? { diapos: diapos.slice(0, 10) } : null;
}

// --- Dessin -------------------------------------------------------------------------

// Coupe un texte en lignes de `max` caractères au plus (mots entiers).
export function couper(texte: string, max: number): string[] {
  const lignes: string[] = [];
  let courante = "";
  for (const mot of texte.split(/\s+/).filter(Boolean)) {
    if (!courante) courante = mot;
    else if (courante.length + 1 + mot.length <= max) courante += ` ${mot}`;
    else {
      lignes.push(courante);
      courante = mot;
    }
  }
  if (courante) lignes.push(courante);
  return lignes;
}

// Couleur « #RRGGBB » → couleur ASS « &HBBGGRR& ».
export function couleurAss(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const c = (m?.[1] ?? "F59E0B").toUpperCase();
  return `&H${c.slice(4, 6)}${c.slice(2, 4)}${c.slice(0, 2)}&`;
}

// Échappe le texte pour ASS (accolades et retours à la ligne).
const ass = (s: string) => s.replace(/[{}]/g, "").replace(/\\/g, "");

const temps = (s: number) => `0:${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}.00`;

// Script ASS de tout le carrousel : la diapositive i est affichée de la
// seconde i à i + 1 (une image par seconde → une image par diapositive).
export function scriptCarrousel(diapos: Diapo[], options: { accent?: string; signature?: string | null } = {}) {
  const accent = couleurAss(options.accent ?? "#F59E0B");
  const blanc = "&HFFFFFF&";
  const gris = "&HE1D5CB&"; // #CBD5E1
  const n = diapos.length;
  const evenements: string[] = [];
  const ajouter = (i: number, texte: string) => evenements.push(`Dialogue: 0,${temps(i)},${temps(i + 1)},Base,,0,0,0,,${texte}`);
  // Bande d'accent en haut et filet en bas (dessins vectoriels ASS).
  const bande = (i: number) => {
    ajouter(i, `{\\an7\\pos(0,0)\\bord0\\shad0\\1c${accent}\\p1}m 0 0 l ${LARGEUR_DIAPO} 0 l ${LARGEUR_DIAPO} 14 l 0 14{\\p0}`);
    ajouter(i, `{\\an7\\pos(80,${HAUTEUR_DIAPO - 150})\\bord0\\shad0\\1c${accent}\\alpha&H60&\\p1}m 0 0 l ${LARGEUR_DIAPO - 160} 0 l ${LARGEUR_DIAPO - 160} 3 l 0 3{\\p0}`);
  };
  diapos.forEach((d, i) => {
    bande(i);
    // Compteur en haut à droite, signature en bas à gauche.
    ajouter(i, `{\\an9\\pos(1000,60)\\fs34\\1c${gris}\\bord0\\shad0}${i + 1}/${n}`);
    if (options.signature) ajouter(i, `{\\an1\\pos(80,${HAUTEUR_DIAPO - 80})\\fs32\\1c${gris}\\bord0\\shad0}${ass(options.signature)}`);
    if (i === 0) {
      // Couverture : grande accroche, sous-titre, invitation à glisser.
      const lignes = couper(d.titre.toUpperCase(), 15).slice(0, 5);
      const y = 400;
      ajouter(i, `{\\an7\\pos(80,${y})\\fs104\\1c${blanc}\\bord0\\shad0\\fsp1}${lignes.map(ass).join("\\N")}`);
      const ySous = y + lignes.length * 126 + 60;
      ajouter(i, `{\\an7\\pos(80,${ySous})\\fs54\\1c${accent}\\bord0\\shad0}${couper(d.texte, 28).slice(0, 3).map(ass).join("\\N")}`);
      ajouter(i, `{\\an3\\pos(1000,${HAUTEUR_DIAPO - 80})\\fs40\\1c${accent}\\bord0\\shad0}Glisse  →`);
      return;
    }
    const derniere = i === n - 1;
    // Numéro de l'idée (pas sur la dernière diapositive).
    if (!derniere) ajouter(i, `{\\an7\\pos(80,250)\\fs170\\1c${accent}\\bord0\\shad0}${i}`);
    const yTitre = derniere ? 470 : 500;
    const titre = couper(d.titre, derniere ? 17 : 20).slice(0, 4);
    const taille = derniere ? 92 : 78;
    ajouter(i, `{\\an7\\pos(80,${yTitre})\\fs${taille}\\1c${derniere ? accent : blanc}\\bord0\\shad0}${titre.map(ass).join("\\N")}`);
    const yTexte = yTitre + titre.length * Math.round(taille * 1.22) + 50;
    ajouter(i, `{\\an7\\pos(80,${yTexte})\\fs54\\1c${gris}\\bord0\\shad0}${couper(d.texte, 29).slice(0, 7).map(ass).join("\\N")}`);
  });
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${LARGEUR_DIAPO}
PlayResY: ${HAUTEUR_DIAPO}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Base,DejaVu Sans,48,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${evenements.join("\n")}
`;
}

// Titre du document LinkedIn : l'accroche de la couverture.
export const titreDocument = (c: Carrousel) => c.diapos[0]?.titre.slice(0, 100) || "Carrousel";
