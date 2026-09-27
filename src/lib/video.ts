import { z } from "zod";

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

export function consigneScript(t: { titre: string; consigne: string }, contexte: string | null, plateforme: string, avecCaptures = false) {
  return `Écris le script d'une vidéo verticale de 30 à 45 secondes pour ${plateforme}, en français.
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
    { texte_ecran: raccourcir(t.titre), voix: phrases[0] ?? t.titre, visuel: t.titre, recherche_stock: recherche(0), type_visuel: "terrain" },
    ...phrases.slice(1).map((p, i) => ({
      texte_ecran: raccourcir(p),
      voix: p,
      visuel: p,
      recherche_stock: recherche(i + 1),
      type_visuel: (i === 0 ? "produit" : "terrain") as "produit" | "terrain",
    })),
  ];
  while (scenes.length < 3) {
    const i = scenes.length;
    scenes.push({ texte_ecran: raccourcir(t.consigne || t.titre), voix: t.consigne || t.titre, visuel: t.titre, recherche_stock: recherche(i), type_visuel: "terrain" });
  }
  scenes.push({
    texte_ecran: marque || "Essayez maintenant",
    voix: `${marque ? `Découvrez ${marque}` : "Découvrez-le"}${lien ? ` sur ${lien}` : ""}.`,
    visuel: t.titre,
    recherche_stock: recherche(scenes.length),
    type_visuel: "produit",
  });
  return { titre: t.titre, scenes: scenes.slice(0, 8), legende: t.brouillon || t.titre };
}

// Avec des captures du produit : au moins une scène du milieu et la dernière
// les montrent, trois au plus (le reste montre la clientèle au travail).
export function imposerScenesProduit(script: ScriptVideo): ScriptVideo {
  const n = script.scenes.length;
  const scenes = script.scenes.map((s, i) => ({ ...s, type_visuel: i === n - 1 ? ("produit" as const) : s.type_visuel }));
  const milieu = scenes.slice(1, -1);
  if (!milieu.some((s) => s.type_visuel === "produit") && n >= 3) scenes[Math.floor(n / 2)].type_visuel = "produit";
  let produits = 0;
  for (const s of scenes) if (s.type_visuel === "produit" && ++produits > 3) s.type_visuel = "terrain";
  if (scenes[n - 1].type_visuel !== "produit") scenes[n - 1].type_visuel = "produit";
  return { ...script, scenes };
}
