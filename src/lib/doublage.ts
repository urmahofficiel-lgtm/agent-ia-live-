import { z } from "zod";

// Doublage : refaire les voix d'une vidéo avec des voix réalistes, sans rien
// changer d'autre (images, rythme, texte). Logique pure : découpage de la
// transcription en répliques, relecture par l'IA (texte corrigé, qui parle),
// choix d'une voix par personnage, calage de chaque réplique à sa place.

export type Mot = { texte: string; debut: number; fin: number; locuteur: string | null };
export type Replique = { debut: number; fin: number; texte: string; locuteur: string };
export type Genre = "femme" | "homme";
export type Personnage = { id: string; role: string; genre: Genre };
export type VoixDispo = { id: string; nom: string; genre: Genre | null; francaise: boolean };

// Mots (ElevenLabs Scribe, avec qui parle) → répliques : on coupe quand la
// personne change, après une fin de phrase suivie d'un blanc, ou sur un long
// silence.
export function repliquesDepuisMots(mots: Mot[], silence = 0.7): Replique[] {
  const sortie: Replique[] = [];
  let courante: Replique | null = null;
  for (const m of mots) {
    const texte = m.texte.trim();
    if (!texte) continue;
    const locuteur = m.locuteur ?? "voix_1";
    const blanc = courante ? m.debut - courante.fin : 0;
    const finDePhrase = courante ? /[.!?…]$/.test(courante.texte) : false;
    if (!courante || locuteur !== courante.locuteur || blanc > silence * 2 || (finDePhrase && blanc > silence)) {
      if (courante) sortie.push(courante);
      courante = { debut: m.debut, fin: m.fin, texte, locuteur };
    } else {
      courante.texte += /^[,.!?;:…)]/.test(texte) ? texte : ` ${texte}`;
      courante.fin = m.fin;
    }
  }
  if (courante) sortie.push(courante);
  return sortie.map((r) => ({ ...r, debut: arrondi(r.debut), fin: arrondi(r.fin) }));
}

const arrondi = (x: number) => Math.round(x * 100) / 100;

// Transcription par Gemini (sans clé ElevenLabs) : il renvoie lui-même les
// répliques minutées.
export const CONSIGNE_ECOUTE = `Écoute cet audio (la bande son d'une vidéo en français) et transcris chaque réplique avec ses temps.
Une réplique = une phrase ou deux dites par la même personne, sans long silence.
Pour chaque réplique : "debut" et "fin" en secondes (précis au dixième), "texte" exact (français correct, ponctuation), "locuteur" = "voix_1", "voix_2"… (la même voix garde le même numéro).
Réponds UNIQUEMENT en JSON : {"repliques": [{"debut": 3.8, "fin": 7.3, "texte": "…", "locuteur": "voix_1"}]}`;

const schemaRepliques = z.object({
  repliques: z
    .array(
      z.object({
        debut: z.coerce.number().catch(-1),
        fin: z.coerce.number().catch(-1),
        texte: z.string().catch(""),
        locuteur: z.string().catch("voix_1"),
      }),
    )
    .catch([]),
});

const json = (reponse: string) => {
  const m = reponse.match(/\{[\s\S]*\}/)?.[0];
  if (!m) return null;
  try {
    return JSON.parse(m) as unknown;
  } catch {
    return null;
  }
};

export function lireEcoute(reponse: string): Replique[] {
  const brut = json(reponse);
  if (!brut) return [];
  return schemaRepliques
    .parse(brut)
    .repliques.filter((r) => r.texte.trim() && r.debut >= 0 && r.fin > r.debut)
    .map((r) => ({ debut: arrondi(r.debut), fin: arrondi(r.fin), texte: r.texte.trim(), locuteur: r.locuteur.trim() || "voix_1" }))
    .sort((a, b) => a.debut - b.debut);
}

// Relecture : l'IA regarde des images de la vidéo (textes à l'écran, bulles,
// noms des personnages) et corrige la transcription automatique, puis dit qui
// parle (rôle et genre de chaque voix).
export function consigneRelecture(repliques: Replique[], contexte: string | null) {
  return `Voici des images d'une vidéo (planche, dans l'ordre) et la transcription automatique de sa bande son, réplique par réplique.
${contexte ? `\nContexte de la marque (noms de produits, vocabulaire) :\n${contexte.slice(0, 1500)}\n` : ""}
Transcription (numéro, temps, voix, texte) :
${repliques.map((r, i) => `${i}. [${r.debut.toFixed(1)}–${r.fin.toFixed(1)} s] ${r.locuteur} : ${r.texte}`).join("\n")}

Ta mission :
1. Corrige chaque texte : fautes d'écoute (mots mal reconnus, sigles, noms de produits), accords, ponctuation. Appuie-toi sur les textes visibles à l'écran (bulles, titres). Ne change pas le sens, ne raccourcis pas, n'ajoute rien.
2. Dis qui parle : pour chaque voix, son rôle (ex. « l'architecte », « le maçon », « la cliente ») et son genre (femme ou homme), d'après les images et ce qui est dit.

Réponds UNIQUEMENT en JSON :
{"personnages": [{"id": "voix_1", "role": "l'architecte", "genre": "femme"}], "repliques": [{"i": 0, "texte": "texte corrigé"}]}`;
}

const schemaRelecture = z.object({
  personnages: z
    .array(z.object({ id: z.string().catch(""), role: z.string().catch(""), genre: z.string().catch("") }))
    .catch([]),
  repliques: z.array(z.object({ i: z.coerce.number().catch(-1), texte: z.string().catch("") })).catch([]),
});

export const genreDe = (s: string | null | undefined): Genre | null =>
  /^(f|femme|female|woman|femin)/i.test(s ?? "") ? "femme" : /^(h|m|homme|male|man|mascul)/i.test(s ?? "") ? "homme" : null;

// Applique la relecture ; sans réponse exploitable, la transcription reste
// telle quelle et chaque voix est « homme » par défaut.
export function appliquerRelecture(repliques: Replique[], reponse: string | null): { repliques: Replique[]; personnages: Personnage[] } {
  const brut = reponse ? json(reponse) : null;
  const r = brut ? schemaRelecture.parse(brut) : { personnages: [], repliques: [] };
  const corrigees = repliques.map((x, i) => {
    const t = r.repliques.find((y) => y.i === i)?.texte.trim();
    return t ? { ...x, texte: t } : x;
  });
  const ids = [...new Set(corrigees.map((x) => x.locuteur))];
  const personnages = ids.map((id) => {
    const p = r.personnages.find((y) => y.id === id);
    return { id, role: p?.role.trim() || id.replace("_", " "), genre: genreDe(p?.genre) ?? "homme" };
  });
  return { repliques: corrigees, personnages };
}

// Une voix différente par personnage, du bon genre, françaises d'abord. Le
// personnage qui parle le plus prend la première voix de la liste.
export function attribuerVoix(personnages: Personnage[], repliques: Replique[], voix: VoixDispo[]): Record<string, string> {
  const temps = (id: string) => repliques.filter((r) => r.locuteur === id).reduce((s, r) => s + r.fin - r.debut, 0);
  const ordre = [...personnages].sort((a, b) => temps(b.id) - temps(a.id));
  const prises = new Set<string>();
  const choix: Record<string, string> = {};
  for (const p of ordre) {
    const candidates = [...voix].sort((a, b) => Number(b.francaise) - Number(a.francaise));
    const v =
      candidates.find((x) => x.genre === p.genre && !prises.has(x.id)) ??
      candidates.find((x) => x.genre === null && !prises.has(x.id)) ??
      candidates.find((x) => x.genre === p.genre) ??
      candidates[0];
    if (!v) break;
    prises.add(v.id);
    choix[p.id] = v.id;
  }
  return choix;
}

// Place laissée à chaque réplique : jusqu'au début de la suivante (ou la fin
// de la vidéo), moins un petit souffle.
export function placesDisponibles(repliques: Replique[], dureeVideo: number) {
  return repliques.map((r, i) => Math.max(0.5, (repliques[i + 1]?.debut ?? dureeVideo) - r.debut - 0.08));
}

// Accélération pour qu'une voix tienne dans sa place : jamais plus de 25 %
// (au-delà, la voix ne sonne plus naturelle ; elle déborde alors un peu).
export const VITESSE_MAX = 1.25;
export function vitessePour(dureeVoix: number, place: number) {
  if (dureeVoix <= place || place <= 0) return 1;
  return Math.min(VITESSE_MAX, Math.round((dureeVoix / place) * 1000) / 1000);
}
