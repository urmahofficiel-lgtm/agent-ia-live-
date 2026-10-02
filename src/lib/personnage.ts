// Studio vidéo IA : analyse du personnage (âge, sexe) et de la consigne
// (phrase à dire, langue), puis choix de la voix adaptée.

export type Age = "enfant" | "ado" | "adulte" | "senior";
export type Sexe = "homme" | "femme";

export type AnalyseScene = {
  parole: string | null; // ce que le personnage dit, mot pour mot
  langue: string; // code ISO (fr, en, ar, es…)
  age: Age | null;
  sexe: Sexe | null;
  dessin: boolean; // personnage dessiné / dessin animé
  consigne_visuelle: string; // consigne pour l'animation, sans la phrase
};

// Voix Gemini (préréglées) par âge et sexe.
const VOIX: Record<Age, Record<Sexe, string>> = {
  enfant: { femme: "Leda", homme: "Puck" },
  ado: { femme: "Leda", homme: "Puck" },
  adulte: { femme: "Kore", homme: "Charon" },
  senior: { femme: "Gacrux", homme: "Algenib" },
};

export function choisirVoix(a: Pick<AnalyseScene, "age" | "sexe">): string {
  return VOIX[a.age ?? "adulte"][a.sexe ?? "femme"];
}

const DESCRIPTION_AGE: Record<Age, string> = {
  enfant: "un enfant d'environ 8 ans, voix aiguë et enjouée",
  ado: "un adolescent, voix jeune et naturelle",
  adulte: "un adulte, voix naturelle et posée",
  senior: "une personne âgée, voix plus grave et calme",
};

// Manière de dire la phrase (envoyée au synthétiseur vocal).
export function tonVoix(a: AnalyseScene): string {
  const qui = DESCRIPTION_AGE[a.age ?? "adulte"];
  const genre =
    a.sexe === "homme" ? "masculine" : a.sexe === "femme" ? "féminine" : "";
  return `Parle comme ${qui}${genre ? `, voix ${genre}` : ""}, dans la langue du texte (${a.langue}), avec l'émotion qui convient, comme dans une vidéo face caméra${a.dessin ? " de dessin animé, un peu expressive" : ""}.`;
}

// Environ 2,5 mots par seconde de parole.
export const motsMax = (duree: number) => Math.max(5, Math.floor(duree * 2.5));

export function consigneAnalyse(prompt: string, duree: number): string {
  return [
    "Tu prépares une vidéo animée à partir de l'image jointe et de la consigne de l'utilisateur.",
    `Consigne : """${prompt.trim()}"""`,
    `Durée de la vidéo : ${duree} secondes.`,
    "",
    "1. Le personnage principal de l'image : estime son âge (enfant, ado, adulte, senior) et son sexe (homme, femme). Mets null si aucun personnage ou si c'est impossible à dire. Indique si c'est un dessin / dessin animé.",
    "2. Si la consigne demande que le personnage dise quelque chose, recopie la phrase à dire, mot pour mot (garde la langue d'origine). " +
      `Elle doit tenir dans la vidéo : ${motsMax(duree)} mots au maximum (raccourcis légèrement si besoin, sans changer le sens). Sinon null.`,
    "3. La langue de cette phrase (code ISO : fr, en, ar, es…). Sans phrase : la langue de la consigne.",
    "4. Réécris la consigne pour l'animation en anglais, SANS la phrase à dire, en décrivant les mouvements ; si le personnage parle, ajoute « the character is talking to the camera, natural mouth movements ».",
    "",
    'Réponds uniquement en JSON : {"parole": "…" ou null, "langue": "fr", "age": "adulte" ou null, "sexe": "homme" ou null, "dessin": false, "consigne_visuelle": "…"}',
  ].join("\n");
}

const AGES: Age[] = ["enfant", "ado", "adulte", "senior"];

export function lireAnalyse(
  reponse: string,
  promptOrigine: string,
): AnalyseScene | null {
  const debut = reponse.indexOf("{");
  const fin = reponse.lastIndexOf("}");
  if (debut < 0 || fin <= debut) return null;
  try {
    const j = JSON.parse(reponse.slice(debut, fin + 1)) as Record<
      string,
      unknown
    >;
    const parole =
      typeof j.parole === "string" && j.parole.trim()
        ? j.parole.trim().slice(0, 600)
        : null;
    const age = AGES.includes(j.age as Age) ? (j.age as Age) : null;
    const sexe = j.sexe === "homme" || j.sexe === "femme" ? j.sexe : null;
    const langue =
      typeof j.langue === "string" && /^[a-z]{2,3}$/i.test(j.langue)
        ? j.langue.toLowerCase()
        : "fr";
    const visuelle =
      typeof j.consigne_visuelle === "string" &&
      j.consigne_visuelle.trim().length > 5
        ? j.consigne_visuelle.trim()
        : promptOrigine;
    return {
      parole,
      langue,
      age,
      sexe,
      dessin: j.dessin === true,
      consigne_visuelle: visuelle.slice(0, 1500),
    };
  } catch {
    return null;
  }
}
