import { z } from "zod";
import { ACCENT_DEFAUT, couleurAss, texteSurCouleur } from "./couleurs";
import { raccourcir } from "./video";
import type { StyleImage } from "./styles";
import { estEtranger, marcheDe } from "./marches";

// Images avec texte incrusté (accroche, citation, affiche promo) : textes,
// mise en page et sous-titres ASS rendus par ffmpeg. Fonctions pures, testables.

export type StyleTexte = Exclude<StyleImage, "photo">;

const texte = z.string().catch("").transform((x) => x.replace(/\s+/g, " ").trim());
const schemaTextes = z.object({ etiquette: texte, titre: texte, sous_titre: texte, appel: texte });

export type TextesVisuel = z.infer<typeof schemaTextes>;

// Valeur d'une ligne de la fiche marque (« Marque : … »).
export const ligneContexte = (contexte: string | null, etiquette: string) =>
  contexte?.match(new RegExp(`${etiquette}[^:\\n]*: (.+)`))?.[1]?.trim() ?? "";

const CONSIGNES: Record<StyleTexte, string> = {
  accroche: `Image « accroche » : une photo avec un gros titre incrusté.
- titre : 3 à 8 mots qui arrêtent le défilement (question, promesse concrète ou chiffre RÉEL de la fiche).
- sous_titre : 4 à 10 mots qui complètent, ou vide.
- etiquette et appel : vides.`,
  citation: `Image « citation » : fond sobre et une phrase forte.
- titre : UNE phrase forte de 8 à 20 mots, une conviction de la marque sur son métier, qui donne envie de partager. Ce n'est pas la citation d'une personne : n'attribue la phrase à personne.
- sous_titre, etiquette et appel : vides.`,
  promo: `Image « affiche promo ».
- etiquette : 1 à 2 mots (ex. « OFFRE », « NOUVEAU », « EN CE MOMENT »).
- titre : 2 à 6 mots, l'offre. N'invente AUCUN prix, remise, date ou cadeau absent de la fiche : sans promotion dans la fiche, présente l'offre réelle.
- sous_titre : 6 à 12 mots, le bénéfice concret.
- appel : 2 à 4 mots, l'appel à l'action (ex. « Réservez maintenant »).`,
};

export function consigneTextesVisuel(style: StyleTexte, t: { titre: string; brouillon: string }, contexte: string | null, marche?: string | null) {
  const m = marcheDe(marche);
  return `Écris les textes à incruster sur l'image qui accompagne ce post, en ${m.langue}.
${estEtranger(marche) ? `Public : professionnels en ${m.pays}. Tout en ${m.langue}, comme un natif, aucun mot de français ; aucune loi ni norme.\n` : ""}${CONSIGNES[style]}
Pas d'emoji, pas de hashtag, pas de guillemets.
${contexte ? `Fiche de la marque (source de vérité, n'invente aucun fait ni chiffre) :\n${contexte}\n` : ""}Sujet : ${t.titre}
Post :
${t.brouillon}

Réponds UNIQUEMENT par un objet JSON valide : {"etiquette": "", "titre": "", "sous_titre": "", "appel": ""}`;
}

const sansGuillemets = (x: string) => x.replace(/^["'«»“”\s]+|["'«»“”\s]+$/g, "");

export function lireTextesVisuel(reponse: string): TextesVisuel | null {
  const debut = reponse.indexOf("{");
  const fin = reponse.lastIndexOf("}");
  if (debut === -1 || fin <= debut) return null;
  try {
    const t = schemaTextes.parse(JSON.parse(reponse.slice(debut, fin + 1)));
    const propre = { etiquette: sansGuillemets(t.etiquette), titre: sansGuillemets(t.titre), sous_titre: sansGuillemets(t.sous_titre), appel: sansGuillemets(t.appel) };
    return propre.titre ? propre : null;
  } catch {
    return null;
  }
}

// Phrases du post, nettoyées (liens, hashtags, emojis, mise en forme).
function phrases(brouillon: string) {
  return brouillon
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/#[\p{L}\d_]+/gu, " ")
    .replace(/[*_`>]+/g, " ")
    .replace(/\p{Extended_Pictographic}/gu, " ")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length >= 12);
}

// Textes construits sans IA (IA saturée) : la mise en page se fait quand même.
// Marché étranger : ni le titre interne ni l'appel de la fiche (en français),
// seulement le post (déjà dans la langue du marché) et des mots traduits.
export function textesDeSecours(style: StyleTexte, t: { titre: string; brouillon: string }, contexte: string | null, marche?: string | null): TextesVisuel {
  const liste = phrases(t.brouillon);
  const marque = ligneContexte(contexte, "Marque");
  const mots = marcheDe(marche).mots;
  if (estEtranger(marche)) {
    const titre = liste[0] ?? marque;
    if (style === "citation") return { etiquette: "", titre, sous_titre: "", appel: "" };
    if (style === "promo")
      return { etiquette: mots.decouvrir, titre: raccourcir(titre, 6), sous_titre: raccourcir(liste[1] ?? marque, 12), appel: mots.enSavoirPlus };
    return { etiquette: "", titre: raccourcir(titre, 8), sous_titre: marque, appel: "" };
  }
  if (style === "citation") {
    const forte = liste.find((p) => p.split(" ").length >= 6 && p.split(" ").length <= 20) ?? t.titre;
    return { etiquette: "", titre: forte, sous_titre: "", appel: "" };
  }
  if (style === "promo") {
    const appel = raccourcir(ligneContexte(contexte, "Appel à l'action"), 4);
    return {
      etiquette: "À découvrir",
      titre: raccourcir(t.titre, 6),
      sous_titre: raccourcir(liste[0] ?? marque, 12),
      appel: appel || "En savoir plus",
    };
  }
  return { etiquette: "", titre: raccourcir(t.titre, 8), sous_titre: marque, appel: "" };
}

// Largeur moyenne d'un caractère de la police (DejaVu Sans Bold), en
// fraction de sa taille : plus large en majuscules.
const chasse = (majuscules: boolean) => (majuscules ? 0.68 : 0.58);

// Coupe un texte en lignes qui tiennent dans `largeur` pixels.
export function couperLignes(texte: string, taille: number, largeur: number, majuscules = false) {
  const max = Math.max(4, Math.floor(largeur / (taille * chasse(majuscules))));
  const lignes: string[] = [];
  let ligne = "";
  for (const mot of texte.split(/\s+/).filter(Boolean)) {
    if (ligne && (ligne + " " + mot).length > max) {
      lignes.push(ligne);
      ligne = mot;
    } else ligne = ligne ? `${ligne} ${mot}` : mot;
  }
  if (ligne) lignes.push(ligne);
  return lignes;
}

// Plus grande taille (entre `min` et `max`) pour laquelle le texte tient en
// `maxLignes` lignes, ainsi que ces lignes.
export function ajusterTexte(texte: string, largeur: number, maxLignes: number, min: number, max: number, majuscules = false) {
  let taille = Math.round(max);
  let lignes = couperLignes(texte, taille, largeur, majuscules);
  while (lignes.length > maxLignes && taille > min) {
    taille = Math.max(Math.round(min), Math.round(taille * 0.92));
    lignes = couperLignes(texte, taille, largeur, majuscules);
  }
  return { taille, lignes };
}

const echapper = (t: string) => t.replace(/[{}\\]/g, "");
const HAUTEUR_LIGNE = 1.2;

function documentAss(largeur: number, hauteur: number, styles: string[], lignes: string[]) {
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${largeur}
PlayResY: ${hauteur}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${styles.join("\n")}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${lignes.map((l) => `Dialogue: ${l}`).join("\n")}
`;
}

// Style ASS : `bord` = contour (ou marge intérieure de l'encart si `encart`).
const style = (nom: string, taille: number, couleur: string, o: { contour?: string; bord?: number; ombre?: number; encart?: boolean } = {}) =>
  `Style: ${nom},DejaVu Sans,${Math.round(taille)},${couleur},${couleur},${o.contour ?? "&H00000000"},&H90000000,-1,0,0,0,100,100,0,0,${o.encart ? 3 : 1},${Math.round(o.bord ?? 0)},${o.ombre ?? 0},7,0,0,0,1`;

// Couche et durée d'un élément (l'image est prise à la 1re image).
const QUAND = (couche: number) => `${couche},0:00:00.00,0:00:10.00`;
const rectangle = (x: number, y: number, l: number, h: number, couleur: string) =>
  `${QUAND(0)},Forme,,0,0,0,,{\\an7\\pos(${Math.round(x)},${Math.round(y)})\\1c&H${couleur.slice(4)}&\\1a&H${couleur.slice(2, 4)}&\\bord0\\shad0\\p1}m 0 0 l ${Math.round(l)} 0 ${Math.round(l)} ${Math.round(h)} 0 ${Math.round(h)}{\\p0}`;
const bloc = (lignes: string[]) => lignes.map(echapper).join("\\N");

// Mise en page complète d'une image stylée, en sous-titres ASS posés sur le
// fond (photo ou dégradé) par ffmpeg.
export function assVisuel(style_: StyleTexte, t: TextesVisuel, largeur: number, hauteur: number, accent = ACCENT_DEFAUT, marque = "") {
  const court = Math.min(largeur, hauteur);
  const marge = Math.round(court * 0.07);
  const utile = largeur - 2 * marge;
  const blanc = "&H00FFFFFF";
  const styles = [style("Forme", 10, blanc)];
  const ev: string[] = [];

  if (style_ === "accroche") {
    // Bandeau sombre en bas, liseré à la couleur de la marque, gros titre.
    const titre = ajusterTexte(t.titre.toUpperCase(), utile, 3, court * 0.055, court * 0.1, true);
    const sous = t.sous_titre ? couperLignes(t.sous_titre, court * 0.042, utile) : [];
    const pad = Math.round(court * 0.05);
    const hTitre = titre.lignes.length * titre.taille * HAUTEUR_LIGNE;
    const hSous = sous.length ? sous.length * court * 0.042 * 1.3 + court * 0.02 : 0;
    const hBandeau = pad * 2 + hTitre + hSous;
    const y0 = hauteur - hBandeau;
    styles.push(style("Titre", titre.taille, blanc, { ombre: 2 }), style("Sous", court * 0.042, couleurAss(accent)));
    ev.push(rectangle(0, y0, largeur, hBandeau, couleurAss("#0B0F17", 0x38)));
    ev.push(rectangle(0, y0, largeur, Math.max(6, court * 0.012), couleurAss(accent)));
    ev.push(`${QUAND(1)},Titre,,0,0,0,,{\\an7\\pos(${marge},${Math.round(y0 + pad)})}${bloc(titre.lignes)}`);
    if (sous.length) ev.push(`${QUAND(1)},Sous,,0,0,0,,{\\an7\\pos(${marge},${Math.round(y0 + pad + hTitre + court * 0.02)})}${bloc(sous)}`);
    return documentAss(largeur, hauteur, styles, ev);
  }

  if (style_ === "citation") {
    // Guillemet géant, phrase centrée, signature de la marque.
    const phrase = ajusterTexte(t.titre, largeur - 2 * marge * 1.4, 6, court * 0.045, court * 0.085);
    styles.push(
      style("Guillemet", court * 0.3, couleurAss(accent)),
      style("Phrase", phrase.taille, blanc, { ombre: 1 }),
      style("Signature", court * 0.038, couleurAss(accent)),
    );
    ev.push(`${QUAND(1)},Guillemet,,0,0,0,,{\\an7\\pos(${marge},${Math.round(marge * 0.4)})}«`);
    ev.push(`${QUAND(1)},Phrase,,0,0,0,,{\\an5\\pos(${Math.round(largeur / 2)},${Math.round(hauteur / 2)})}${bloc(phrase.lignes)}`);
    const yLigne = hauteur - marge * 1.9;
    ev.push(rectangle(largeur / 2 - court * 0.06, yLigne, court * 0.12, Math.max(4, court * 0.006), couleurAss(accent)));
    if (marque) ev.push(`${QUAND(1)},Signature,,0,0,0,,{\\an8\\pos(${Math.round(largeur / 2)},${Math.round(yLigne + court * 0.025)})}${echapper(marque.toUpperCase())}`);
    return documentAss(largeur, hauteur, styles, ev);
  }

  // Affiche promo : étiquette en haut, titre et sous-titre au centre,
  // bouton d'appel à l'action en bas, nom de la marque en pied.
  const encre = couleurAss(texteSurCouleur(accent));
  const tEtiq = court * 0.042;
  const tSous = court * 0.045;
  const tBouton = court * 0.05;
  const padEncart = court * 0.022;
  const haut = marge + (t.etiquette ? tEtiq * HAUTEUR_LIGNE + 2 * padEncart + court * 0.04 : 0);
  const basBouton = hauteur - marge - (marque ? court * 0.05 : 0);
  const bas = basBouton - (t.appel ? tBouton * HAUTEUR_LIGNE + 2 * padEncart + court * 0.05 : 0);
  const sous = t.sous_titre ? couperLignes(t.sous_titre, tSous, utile) : [];
  const hSous = sous.length ? sous.length * tSous * 1.3 + court * 0.03 : 0;
  // Le titre prend toute la place restante, sur 3 lignes au plus.
  const place = Math.max(court * 0.1, bas - haut - hSous);
  const titre = ajusterTexte(t.titre.toUpperCase(), utile, 3, court * 0.06, Math.min(court * 0.13, place / HAUTEUR_LIGNE), true);
  while (titre.lignes.length * titre.taille * HAUTEUR_LIGNE > place && titre.taille > court * 0.05) {
    titre.taille = Math.round(titre.taille * 0.92);
    titre.lignes = couperLignes(t.titre.toUpperCase(), titre.taille, utile, true);
  }
  const hTitre = titre.lignes.length * titre.taille * HAUTEUR_LIGNE;
  const yBloc = haut + (bas - haut - hTitre - hSous) / 2;
  styles.push(
    style("Etiquette", tEtiq, encre, { contour: couleurAss(accent), bord: padEncart, encart: true }),
    style("Titre", titre.taille, blanc, { ombre: 3 }),
    style("Sous", tSous, blanc, { ombre: 2 }),
    style("Bouton", tBouton, encre, { contour: couleurAss(accent), bord: padEncart, encart: true }),
    style("Marque", court * 0.032, "&H30FFFFFF"),
  );
  const centre = Math.round(largeur / 2);
  if (t.etiquette) ev.push(`${QUAND(1)},Etiquette,,0,0,0,,{\\an8\\pos(${centre},${Math.round(marge + padEncart)})}${echapper(t.etiquette.toUpperCase())}`);
  ev.push(`${QUAND(1)},Titre,,0,0,0,,{\\an8\\pos(${centre},${Math.round(yBloc)})}${bloc(titre.lignes)}`);
  if (sous.length) ev.push(`${QUAND(1)},Sous,,0,0,0,,{\\an8\\pos(${centre},${Math.round(yBloc + hTitre + court * 0.03)})}${bloc(sous)}`);
  if (t.appel) ev.push(`${QUAND(1)},Bouton,,0,0,0,,{\\an2\\pos(${centre},${Math.round(basBouton - padEncart)})}${echapper(t.appel.toUpperCase())}`);
  if (marque) ev.push(`${QUAND(1)},Marque,,0,0,0,,{\\an2\\pos(${centre},${Math.round(hauteur - marge * 0.6)})}${echapper(marque.toUpperCase())}`);
  return documentAss(largeur, hauteur, styles, ev);
}
