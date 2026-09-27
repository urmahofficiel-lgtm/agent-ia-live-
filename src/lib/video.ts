import { z } from "zod";

// Vidéo courte verticale (TikTok, Reels, Shorts) : script, minutage et
// sous-titres. Fonctions pures, testables.

const texte = z.string().catch("").transform((x) => x.trim());

const schemaScript = z.object({
  titre: texte,
  scenes: z
    .array(z.object({ texte_ecran: texte, voix: texte, visuel: texte, recherche_stock: texte }))
    .catch([])
    .transform((l) => l.filter((s) => s.voix || s.texte_ecran).slice(0, 8)),
  legende: texte,
});

export type ScriptVideo = z.infer<typeof schemaScript>;

export function consigneScript(t: { titre: string; consigne: string }, contexte: string | null, plateforme: string) {
  return `Écris le script d'une vidéo verticale de 30 à 45 secondes pour ${plateforme}, en français.
Sujet : ${t.titre}
${t.consigne ? `Consigne : ${t.consigne}\n` : ""}${contexte ? `\nFiche de la marque (source de vérité, n'invente aucun fait, chiffre ni témoignage) :\n${contexte}\n` : ""}
Structure : scène 1 = accroche forte qui arrête le défilement ; scènes du milieu = un problème concret du client puis la fonctionnalité réelle de la marque qui le résout ; dernière scène = appel à l'action avec le nom de la marque.
Réponds UNIQUEMENT par un objet JSON valide :
{"titre": "titre court", "scenes": [{"texte_ecran": "6 mots maximum, percutant", "voix": "1 à 2 phrases parlées, naturelles", "visuel": "English prompt: realistic vertical photo of the scene, the niche's real setting and people, no text", "recherche_stock": "2 to 4 English keywords to find a matching real stock video (e.g. construction worker tablet)"}], "legende": "texte du post qui accompagne la vidéo, avec l'appel à l'action, le lien du site et 3 à 5 hashtags"}
Entre 5 et 7 scènes.`;
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

// Sous-titres stylés (ASS) : gros texte blanc cerné de noir, au centre-bas.
export function sousTitresAss(scenes: { texte_ecran: string }[], d: number[], largeur: number, hauteur: number) {
  let debut = 0;
  const lignes = scenes.map((s, i) => {
    const fin = debut + d[i];
    const l = `Dialogue: 0,${horodatage(debut)},${horodatage(fin)},Principal,,0,0,0,,{\\fad(150,150)}${echapperAss(s.texte_ecran.toUpperCase())}`;
    debut = fin;
    return l;
  });
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${largeur}
PlayResY: ${hauteur}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Principal,DejaVu Sans,${Math.round(largeur * 0.075)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,${Math.round(largeur * 0.008)},2,2,60,60,${Math.round(hauteur * 0.22)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${lignes.join("\n")}
`;
}

// Script construit sans IA à partir du texte de la publication : utilisé
// quand les IA gratuites sont saturées, pour que la vidéo se fasse quand même.
export function scriptDeSecours(t: { titre: string; consigne: string; brouillon?: string | null }, contexte: string | null): ScriptVideo {
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
  const courte = (p: string) => p.replace(/[.!?…:;,]+$/, "").split(" ").slice(0, 6).join(" ");
  const cle = t.titre.replace(/[^\p{L}\d\s-]/gu, " ").trim();

  const scenes = [
    { texte_ecran: courte(t.titre), voix: phrases[0] ?? t.titre, visuel: t.titre, recherche_stock: cle },
    ...phrases.slice(1).map((p) => ({ texte_ecran: courte(p), voix: p, visuel: p, recherche_stock: cle })),
  ];
  while (scenes.length < 3) {
    scenes.push({ texte_ecran: courte(t.consigne || t.titre), voix: t.consigne || t.titre, visuel: t.titre, recherche_stock: cle });
  }
  scenes.push({
    texte_ecran: marque || "Essayez maintenant",
    voix: `${marque ? `Découvrez ${marque}` : "Découvrez-le"}${lien ? ` sur ${lien}` : ""}.`,
    visuel: t.titre,
    recherche_stock: cle,
  });
  return { titre: t.titre, scenes: scenes.slice(0, 8), legende: t.brouillon || t.titre };
}
