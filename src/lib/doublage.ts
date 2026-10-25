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

// --- Écoute guidée (voix Gemini) -------------------------------------------------
// Les passages parlés sont trouvés par le logiciel lui-même (blancs de la
// bande son) : leurs temps sont exacts. L'IA n'écrit que le texte de chaque
// passage et dit qui parle ; la hauteur de chaque voix (mesurée) tranche le
// genre, que l'IA devine mal.

export type Passage = { debut: number; fin: number; hauteur: number | null };

// Blancs (ffmpeg silencedetect) → passages parlés. Deux passages séparés de
// moins de 0,3 s n'en font qu'un ; les bruits de moins de 0,35 s sont ignorés.
export function passagesParles(silences: { debut: number; fin: number }[], duree: number) {
  const parles: { debut: number; fin: number }[] = [];
  let curseur = 0;
  for (const s of [...silences].sort((a, b) => a.debut - b.debut)) {
    if (s.debut > curseur) parles.push({ debut: curseur, fin: Math.min(s.debut, duree) });
    curseur = Math.max(curseur, s.fin);
  }
  if (curseur < duree) parles.push({ debut: curseur, fin: duree });
  const fusion: { debut: number; fin: number }[] = [];
  for (const p of parles) {
    const der = fusion[fusion.length - 1];
    if (der && p.debut - der.fin < 0.3) der.fin = p.fin;
    else fusion.push({ ...p });
  }
  return fusion.filter((p) => p.fin - p.debut >= 0.35).map((p) => ({ debut: arrondi(p.debut), fin: arrondi(p.fin) }));
}

// Hauteur médiane d'une voix (Hz) sur un extrait PCM 16 bits mono, par
// autocorrélation sur des fenêtres de 40 ms (entre 70 et 350 Hz) ; null si
// l'extrait est trop faible pour juger.
export function hauteurMediane(pcm: Int16Array, frequence: number, debut: number, fin: number): number | null {
  return voisement(pcm, frequence, debut, fin).hauteur;
}

// Hauteur médiane et instant de la première syllabe voisée (un son d'intro
// ou un bruit avant la voix ne décale pas la réplique).
export function voisement(pcm: Int16Array, frequence: number, debut: number, fin: number): { hauteur: number | null; premier: number | null } {
  const n = Math.round(0.04 * frequence);
  const min = Math.floor(frequence / 350);
  const max = Math.floor(frequence / 70);
  const valeurs: number[] = [];
  let premier: number | null = null;
  let precedente = -1;
  for (let s = Math.floor(debut * frequence); s + n <= Math.min(pcm.length, fin * frequence); s += n) {
    let moyenne = 0;
    for (let k = 0; k < n; k++) moyenne += pcm[s + k];
    moyenne /= n;
    const x = new Float32Array(n);
    let energie = 0;
    for (let k = 0; k < n; k++) {
      x[k] = (pcm[s + k] - moyenne) / 32768;
      energie += x[k] * x[k];
    }
    if (Math.sqrt(energie / n) < 0.02) continue;
    let meilleur = 0;
    let decalage = 0;
    for (let d = min; d <= max; d++) {
      let c = 0;
      for (let k = 0; k + d < n; k++) c += x[k] * x[k + d];
      if (c > meilleur) {
        meilleur = c;
        decalage = d;
      }
    }
    if (decalage && meilleur > 0.3 * energie) {
      valeurs.push(frequence / decalage);
      // Première syllabe : deux fenêtres voisées d'affilée.
      if (premier === null && precedente === s - n) premier = Math.max(debut, (s - n) / frequence);
      precedente = s;
    }
  }
  if (valeurs.length < 3) return { hauteur: null, premier };
  valeurs.sort((a, b) => a - b);
  return { hauteur: Math.round(valeurs[Math.floor(valeurs.length / 2)]), premier };
}

// Durée approximative d'une phrase dite à voix haute (≈ 14 caractères par
// seconde en français).
export const dureeParlee = (texte: string) => 0.3 + texte.length / 14;

// Au-dessus : voix de femme ; en dessous de la seconde : voix d'homme.
const SEUIL_FEMME = 165;
const SEUIL_HOMME = 150;
export const genreDeHauteur = (h: number | null): Genre | null => (h === null ? null : h >= SEUIL_FEMME ? "femme" : h < SEUIL_HOMME ? "homme" : null);

// Chaque passage est transcrit seul, dans sa propre demande : l'IA ne peut
// pas faire glisser un texte d'un passage à l'autre.
export function consigneExtrait(contexte: string | null) {
  return `Cet extrait audio vient d'une vidéo en français.${contexte ? ` Vocabulaire de la marque (orthographe des noms de produits) : ${contexte.slice(0, 400).replace(/\s+/g, " ")}` : ""}
1. "texte" : écris exactement ce qui est prononcé dans l'extrait, en français correct (ponctuation, accords, sigles bien écrits). Rien d'autre. Si personne ne parle (musique, bruit) : "".
2. "debut" : le nombre de secondes, depuis le début de l'extrait, où la parole commence (0 si elle commence tout de suite ; plus s'il y a d'abord un son d'intro, de la musique ou un bruit).
Réponds UNIQUEMENT en JSON : {"texte": "…", "debut": 0}`;
}

const schemaExtrait = z.object({ texte: z.string().catch(""), debut: z.coerce.number().nullable().catch(null) });

export function lireExtrait(reponse: string): { texte: string; debut: number | null } {
  const brut = json(reponse);
  if (!brut) return { texte: "", debut: null };
  const x = schemaExtrait.parse(brut);
  return { texte: x.texte.replace(/\s+/g, " ").trim(), debut: x.debut };
}

// Puis une seule demande, sans audio, pour dire qui parle : le texte de
// chaque passage, la hauteur de voix mesurée et une planche d'images.
export function consigneQuiParle(passages: (Passage & { texte: string })[], contexte: string | null) {
  return `Voici une planche d'images d'une vidéo (dans l'ordre) et le texte de chaque passage parlé, avec ses temps et la hauteur de la voix mesurée.
${contexte ? `\nContexte de la marque :\n${contexte.slice(0, 1200)}\n` : ""}
${passages.map((p, i) => `${i}. [${p.debut.toFixed(1)}–${p.fin.toFixed(1)} s · ${p.hauteur === null ? "?" : `${p.hauteur} Hz, ${genreDeHauteur(p.hauteur) ?? "?"}`}] ${p.texte || "(rien)"}`).join("\n")}

Dis qui parle dans chaque passage : "voix_1", "voix_2"… (la même personne garde le même numéro dans toute la vidéo). Une voix aiguë (plus de 165 Hz) est une femme, une voix grave un homme ; deux passages de hauteurs très différentes ne sont pas la même personne. Appuie-toi sur le sens (qui répond à qui, qui se présente) et les images (personnages, bulles).
Si un mot a manifestement été mal entendu (absurde dans le contexte, ex. « des devis sages partout » pour « des messages partout »), donne le texte corrigé dans "texte" ; sinon n'écris pas "texte". Ne reformule pas, n'ajoute rien, ne coupe rien.
Puis décris chaque voix : son rôle (ex. « l'architecte », « le maçon », « la cliente ») et son genre.

Réponds UNIQUEMENT en JSON :
{"personnages": [{"id": "voix_1", "role": "l'architecte", "genre": "femme"}], "passages": [{"i": 0, "locuteur": "voix_1"}, {"i": 7, "locuteur": "voix_1", "texte": "Des messages partout, et c'est toujours moi qu'on appelle."}]}`;
}

// Textes (un par passage) + réponse « qui parle » → même forme que l'écoute
// guidée, lue par lireEcouteGuidee.
export function assemblerEcoute(textes: { texte: string; debut: number | null }[], quiParle: string | null) {
  const brut = quiParle ? json(quiParle) : null;
  const q = brut ? schemaEcouteGuidee.parse(brut) : { personnages: [], passages: [] };
  return JSON.stringify({
    personnages: q.personnages,
    passages: textes.map((t, i) => {
      const x = q.passages.find((y) => y.i === i);
      // Correction d'un mot mal entendu : gardée seulement si la phrase reste
      // de même longueur (jamais une phrase ajoutée ou coupée).
      const corrige = x?.texte?.trim() ?? "";
      const proche = corrige && t.texte && corrige.length >= t.texte.length * 0.7 && corrige.length <= t.texte.length * 1.4;
      return { i, texte: proche ? corrige : t.texte, debut: t.debut, locuteur: x?.locuteur || "voix_1" };
    }),
  });
}

const schemaEcouteGuidee = z.object({
  personnages: z
    .array(z.object({ id: z.string().catch(""), role: z.string().catch(""), genre: z.string().catch("") }))
    .catch([]),
  passages: z
    .array(z.object({ i: z.coerce.number().catch(-1), texte: z.string().catch(""), debut: z.coerce.number().nullable().catch(null), locuteur: z.string().catch("") }))
    .catch([]),
});

// Réponse de l'IA + passages mesurés → répliques et personnages. Le genre
// mesuré l'emporte : un passage à voix de femme donné à un homme (ou
// l'inverse) passe au personnage du bon genre le plus proche en hauteur, ou à
// un nouveau personnage.
export function lireEcouteGuidee(reponse: string, passages: Passage[]): { repliques: Replique[]; personnages: Personnage[] } {
  const brut = json(reponse);
  const r = brut ? schemaEcouteGuidee.parse(brut) : { personnages: [], passages: [] };
  const lignes = passages
    .map((p, i) => {
      const x = r.passages.find((y) => y.i === i);
      // Début de la parole dans l'extrait (son d'intro avant la voix), s'il
      // tombe bien dans le passage.
      const decalage = x?.debut ?? 0;
      const texte = (x?.texte ?? "").replace(/\s+/g, " ").trim();
      // Passage bien plus long que la phrase (son d'intro avant la voix) :
      // sans début donné par l'IA, la phrase est calée sur la fin du passage.
      const longue = texte && p.fin - p.debut > 2 * dureeParlee(texte) + 0.5;
      const debut =
        decalage > 0.2 && p.debut + decalage < p.fin - 0.2
          ? arrondi(p.debut + decalage)
          : longue
            ? arrondi(Math.max(p.debut, p.fin - dureeParlee(texte) * 1.15))
            : p.debut;
      return { ...p, debut, texte, locuteur: x?.locuteur.trim() || "voix_1" };
    })
    .filter((x) => x.texte);

  // Genre de chaque personnage ; sa hauteur : la médiane des passages de ce
  // genre.
  const personnages: (Personnage & { hauteur: number | null })[] = [...new Set(lignes.map((x) => x.locuteur))].map((id) => {
    const p = r.personnages.find((y) => y.id === id);
    const siens = lignes.filter((x) => x.locuteur === id);
    const temps = (g: Genre) => siens.filter((x) => genreDeHauteur(x.hauteur) === g).reduce((t, x) => t + x.fin - x.debut, 0);
    // Le genre déclaré par l'IA (d'après le rôle : « le maçon ») tient s'il
    // correspond à au moins un passage mesuré ; sinon la majorité mesurée.
    const declare = genreDe(p?.genre);
    const mesure = temps("femme") > temps("homme") ? "femme" : temps("homme") > temps("femme") ? "homme" : null;
    const genre = (declare && (temps(declare) > 0 || !mesure) ? declare : mesure) ?? "homme";
    const h = siens.filter((x) => genreDeHauteur(x.hauteur) === genre).map((x) => x.hauteur!).sort((a, b) => a - b);
    return { id, role: p?.role.trim() || id.replace("_", " "), genre, hauteur: h.length ? h[Math.floor(h.length / 2)] : null };
  });
  for (const x of lignes) {
    const g = genreDeHauteur(x.hauteur);
    const p = personnages.find((y) => y.id === x.locuteur)!;
    if (!g || g === p.genre) continue;
    const proche = personnages
      .filter((y) => y.genre === g && y.hauteur !== null)
      .sort((a, b) => Math.abs(a.hauteur! - x.hauteur!) - Math.abs(b.hauteur! - x.hauteur!))[0];
    if (proche) x.locuteur = proche.id;
    else {
      const id = `voix_${personnages.length + 1}`;
      personnages.push({ id, role: g === "femme" ? "une femme" : "un homme", genre: g, hauteur: x.hauteur });
      x.locuteur = id;
    }
  }
  const utilises = new Set(lignes.map((x) => x.locuteur));
  return {
    repliques: lignes.map(({ debut, fin, texte, locuteur }) => ({ debut, fin, texte, locuteur })),
    personnages: personnages.filter((p) => utilises.has(p.id)).map(({ id, role, genre }) => ({ id, role, genre })),
  };
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

// Voix Gemini (clé déjà en place), par genre : les plus naturelles en français
// d'abord.
export const VOIX_GEMINI: VoixDispo[] = [
  ...["Kore", "Aoede", "Leda", "Despina", "Sulafat", "Callirrhoe"].map((id) => ({ id, nom: id, genre: "femme" as const, francaise: true })),
  ...["Charon", "Puck", "Orus", "Algieba", "Iapetus", "Sadaltager"].map((id) => ({ id, nom: id, genre: "homme" as const, francaise: true })),
];

// Façon de dire une réplique (voix Gemini) : une vraie personne qui parle,
// selon son rôle et le type de phrase — jamais un ton de publicité.
export function styleReplique(p: Pick<Personnage, "role" | "genre">, texte: string) {
  const qui = p.role && !/^voix /.test(p.role) ? p.role : p.genre === "femme" ? "une femme" : "un homme";
  const t = texte.trim();
  const facon = /\?$/.test(t)
    ? "pose la question avec une vraie curiosité, un peu pressé"
    : /!$/.test(t)
      ? "avec de l'énergie et le sourire"
      : /^(ok|parfait|reçu|voilà|c'est noté|pareil|moi aussi)/i.test(t)
        ? "répond du tac au tac, détendu"
        : "parle simplement, comme à un collègue";
  return `français naturel de France, ${qui} qui ${facon} sur un chantier ; voix humaine et spontanée, rythme de conversation, respirations naturelles, aucun ton de publicité ni de lecture`;
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
