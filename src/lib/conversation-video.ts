import { z } from "zod";
import { marcheDe, reglesMarche } from "./marches";

// Vidéo « conversation » : une discussion de messagerie qui s'affiche bulle
// après bulle (client difficile, fournisseur, conjoint…), avec une accroche
// en haut et une question finale qui fait commenter. Fonctions pures : script,
// minutage, mise en page et sous-titres ASS (dessinés par libass au montage).

const texte = z.string().catch("").transform((x) => nettoyer(x));

// La police embarquée n'a pas d'émojis ni de symboles exotiques : on les
// retire pour éviter des carrés vides à l'écran.
export function nettoyer(x: string) {
  return x
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "")
    .replace(/[{}\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const schema = z.object({
  accroche: texte,
  contact: texte,
  messages: z
    .array(z.object({ de: z.enum(["lui", "moi"]).catch("lui"), texte }))
    .catch([])
    .transform((l) => l.filter((m) => m.texte).slice(0, 10).map((m) => ({ ...m, texte: m.texte.slice(0, 140) }))),
  chute: texte,
  question: texte,
  legende: z.string().catch("").transform((x) => x.trim()),
});

export type ScriptConversation = z.infer<typeof schema>;

// Situations vécues par la clientèle, tirées à tour de rôle : chaque vidéo
// raconte une histoire différente.
export const SCENARIOS = [
  "un client qui demande une remise une fois le chantier terminé",
  "un client qui conteste l'avancement des travaux et refuse de payer l'acompte",
  "un client qui ajoute des travaux « en plus » sans vouloir les payer",
  "un fournisseur en retard de livraison le jour du chantier",
  "le conjoint qui demande à quelle heure il rentre, alors qu'il fait encore ses devis à 22 h",
  "un client qui envoie une photo floue et demande un prix exact tout de suite",
  "un architecte qui change les plans la veille du démarrage",
  "un client qui compare avec un devis deux fois moins cher trouvé sur internet",
  "un client qui relance pour son devis promis il y a une semaine",
  "un apprenti qui se trompe de chantier le premier jour",
] as const;

export function scenarioPour(graine: string) {
  let h = 0;
  for (const c of graine) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return SCENARIOS[h % SCENARIOS.length];
}

export function consigneConversation(
  t: { titre: string; consigne: string },
  contexte: string | null,
  scenario: string,
  marche?: string | null,
) {
  return `Écris une conversation de messagerie (type SMS / WhatsApp) pour une vidéo virale TikTok et Reels de 20 à 30 secondes, en ${marcheDe(marche).langue}.
Situation : ${scenario}.
Sujet de la publication (à relier si possible) : ${t.titre}
${contexte ? `\nFiche de la marque (source de vérité, n'invente aucun chiffre, prix ou témoignage) :\n${contexte}\n` : ""}
« moi » = le professionnel visé par la marque (son métier, son vocabulaire). « lui » = l'autre personne de la situation.
Règles pour que la vidéo explose :
- Une histoire vraie que tout le métier a vécue : on doit se reconnaître, sourire ou s'énerver dès le 2e message.
- Messages courts et naturels comme de vrais SMS (5 à 18 mots), langage parlé, quelques fautes de frappe autorisées pour « lui ».
- Une montée de tension, puis une chute inattendue ou très satisfaisante au dernier message.
- La marque n'apparaît qu'UNE fois, au plus, et naturellement (par exemple « je t'envoie le suivi avec photos datées »), jamais comme une pub.
- Pas d'émoji, pas de hashtag dans les messages.
Réponds UNIQUEMENT par un objet JSON valide :
{"accroche": "phrase choc affichée en haut pendant toute la vidéo, 4 à 9 mots, qui donne envie de lire la suite", "contact": "nom court affiché en haut de la conversation, 22 caractères au plus (ex. M. Durand - Client)", "messages": [{"de": "lui ou moi", "texte": "..."}], "chute": "phrase finale affichée à la fin, 4 à 10 mots", "question": "question au public pour faire commenter, 5 à 12 mots", "legende": "texte du post : 1 à 2 phrases qui donnent envie de commenter, l'appel à l'action de la marque avec son lien, 3 à 5 hashtags"}
Entre 7 et 9 messages, en commençant par « lui ».${reglesMarche(marche) ? `\n${reglesMarche(marche)}` : ""}`;
}

export function lireConversation(reponse: string): ScriptConversation | null {
  const json = reponse.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  try {
    const s = schema.parse(JSON.parse(json));
    if (s.messages.length < 4 || !s.accroche) return null;
    return { ...s, contact: s.contact || "Client", question: s.question || "Vous auriez répondu quoi ?" };
  } catch {
    return null;
  }
}

// Sans IA : une histoire écrite d'avance, pour que la vidéo se fasse quand même.
export function conversationDeSecours(marque: string): ScriptConversation {
  return {
    accroche: "Il me demande une remise APRÈS le chantier",
    contact: "M. Martin - Client",
    messages: [
      { de: "lui", texte: "Bonjour, la salle de bain est finie, merci" },
      { de: "lui", texte: "Par contre le carrelage n'est pas exactement la couleur prévue" },
      { de: "moi", texte: "C'est la référence que vous avez choisie et validée le 3 mars" },
      { de: "lui", texte: "Oui mais en vrai c'est plus clair, vous pouvez faire un geste ?" },
      { de: "lui", texte: "Disons 20% et on n'en parle plus" },
      { de: "moi", texte: "Je vous envoie le devis signé et les photos datées de chaque étape" },
      { de: "lui", texte: "Ah. Bon. Je fais le virement ce soir" },
    ],
    chute: "Les photos datées, ça règle tout",
    question: "Vous auriez fait un geste, vous ?",
    legende: `Qui a déjà vécu ça ? Racontez-nous en commentaire. Suivi de chantier avec photos datées : ${marque}. #artisan #btp #chantier #renovation`,
  };
}

// --- Minutage -----------------------------------------------------------------

export const ACCROCHE_SEULE = 1.2; // l'accroche seule avant le 1er message
export const DUREE_FIN = 3.5; // carte finale (chute + question)

// Temps de lecture d'un message : court pour un SMS, plus long pour une phrase.
export const tempsLecture = (texte: string) => Math.min(3.2, Math.max(1.3, 0.7 + texte.length * 0.04));

// Instant d'apparition de chaque message, et durée totale de la vidéo.
export function minutage(messages: { texte: string }[]) {
  const debuts: number[] = [];
  let t = ACCROCHE_SEULE;
  for (const m of messages) {
    debuts.push(t);
    t += tempsLecture(m.texte);
  }
  return { debuts, finMessages: t, total: t + DUREE_FIN };
}

// --- Mise en page ----------------------------------------------------------------

export const ECRAN = { largeur: 720, hauteur: 1280 };
export const ZONE = { haut: 330, bas: 1170 }; // zone des bulles, entre l'en-tête et la barre de saisie
const TAILLE = 32; // taille du texte des bulles
const INTERLIGNE = 40;
const MARGE_BULLE = 22;
const ECART = 16;
const LARGEUR_MAX = 500;
// Largeur moyenne d'un caractère de DejaVu Sans Bold (prudente).
const CHASSE = TAILLE * 0.6;

// Coupe un message en lignes qui tiennent dans la bulle.
export function couper(texte: string, largeurMax = LARGEUR_MAX - 2 * MARGE_BULLE, taille = TAILLE) {
  const parLigne = Math.max(8, Math.floor(largeurMax / (taille * 0.6)));
  const lignes: string[] = [];
  let courante = "";
  for (const mot of texte.split(" ")) {
    const morceaux = mot.length > parLigne ? mot.match(new RegExp(`.{1,${parLigne}}`, "g")) ?? [mot] : [mot];
    for (const m of morceaux) {
      if (!courante) courante = m;
      else if ((courante + " " + m).length <= parLigne) courante += " " + m;
      else {
        lignes.push(courante);
        courante = m;
      }
    }
  }
  if (courante) lignes.push(courante);
  return lignes;
}

export type Bulle = { de: "lui" | "moi"; lignes: string[]; x: number; y: number; l: number; h: number };

// Position de chaque bulle dans le fil (avant défilement).
export function bulles(messages: { de: "lui" | "moi"; texte: string }[]): Bulle[] {
  let y = ZONE.haut + 20;
  return messages.map((m) => {
    const lignes = couper(m.texte);
    const plusLongue = Math.max(...lignes.map((x) => x.length), 5);
    const l = Math.min(LARGEUR_MAX, Math.round(plusLongue * CHASSE + 2 * MARGE_BULLE + 70));
    const h = lignes.length * INTERLIGNE + 2 * MARGE_BULLE + 4;
    const x = m.de === "moi" ? ECRAN.largeur - 28 - l : 28;
    const b = { de: m.de, lignes, x, y, l, h };
    y += h + ECART;
    return b;
  });
}

// Défilement après l'apparition de la bulle k : la dernière bulle reste visible
// au-dessus de la barre de saisie.
export function defilement(liste: Bulle[], k: number) {
  const bas = liste[k].y + liste[k].h;
  return Math.max(0, bas - (ZONE.bas - 20));
}

// --- Sous-titres ASS ----------------------------------------------------------------

const ass = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${sec.toFixed(2).padStart(5, "0")}`;
};

// Rectangle aux coins arrondis (dessin vectoriel ASS, origine en haut à gauche).
export function rectangleArrondi(l: number, h: number, r: number) {
  const R = Math.min(r, l / 2, h / 2);
  return `m ${R} 0 l ${l - R} 0 b ${l} 0 ${l} 0 ${l} ${R} l ${l} ${h - R} b ${l} ${h} ${l} ${h} ${l - R} ${h} l ${R} ${h} b 0 ${h} 0 ${h} 0 ${h - R} l 0 ${R} b 0 0 0 0 ${R} 0`;
}

const COULEURS = {
  fond: "&H00DDE5EC&", // beige WhatsApp (BGR)
  entete: "&H00545E07&", // vert foncé
  lui: "&H00FFFFFF&",
  moi: "&H00C6F8DC&",
  texte: "&H00202020&",
  heure: "&H00808080&",
  accroche: "&H00000000&",
};

// Nom du contact dans l'en-tête : coupé entre deux mots, sans parenthèse ouverte.
export function nomCourt(nom: string, max = 28) {
  const propre = nom.replace(/\s*\([^)]*$/, "").trim();
  if (propre.length <= max) return propre;
  const coupe = propre.slice(0, max).replace(/\s+\S*$/, "");
  return `${coupe || propre.slice(0, max)}...`;
}

// Accroche de la bande du haut : la plus grande taille qui tient en 3 lignes.
export function lignesAccroche(accroche: string) {
  const texte = accroche.toUpperCase();
  for (const taille of [46, 40, 34, 30]) {
    const lignes = couper(texte, 660, taille);
    if (lignes.length <= (taille >= 46 ? 2 : 3)) return { lignes, taille };
  }
  return { lignes: couper(texte, 660, 30).slice(0, 3), taille: 30 };
}

export function sousTitresConversation(s: ScriptConversation, heure = "18:42") {
  const { debuts, finMessages, total } = minutage(s.messages);
  const liste = bulles(s.messages);
  const fin = ass(total);
  const ev: string[] = [];
  const dessin = (debut: number, finEv: number, x: number, y: number, couleur: string, forme: string, extra = "", couche = 0) =>
    ev.push(`Dialogue: ${couche},${ass(debut)},${ass(finEv)},Texte,,0,0,0,,{\\an7\\pos(${x},${y})\\bord0\\shad0\\1c${couleur}\\p1${extra}}${forme}{\\p0}`);
  const ecrire = (couche: number, debut: number, finEv: number, tags: string, t: string) =>
    ev.push(`Dialogue: ${couche},${ass(debut)},${ass(finEv)},Texte,,0,0,0,,{${tags}}${t}`);

  // Décor fixe : fond, bande d'accroche, en-tête, barre de saisie.
  dessin(0, total, 0, 0, COULEURS.fond, rectangleArrondi(ECRAN.largeur, ECRAN.hauteur, 0));
  dessin(0, total, 0, 0, "&H00FFFFFF&", rectangleArrondi(ECRAN.largeur, 220, 0));
  const accroche = lignesAccroche(s.accroche);
  ecrire(2, 0, total, `\\an5\\pos(360,112)\\fs${accroche.taille}\\1c${COULEURS.accroche}\\bord0\\shad0`, accroche.lignes.join("\\N"));
  dessin(0, total, 0, 220, COULEURS.entete, rectangleArrondi(ECRAN.largeur, 100, 0));
  dessin(0, total, 30, 238, "&H00BDBDBD&", rectangleArrondi(64, 64, 32));
  const initiale = (s.contact.match(/[A-Za-zÀ-ÿ]/)?.[0] ?? "C").toUpperCase();
  ecrire(2, 0, total, `\\an5\\pos(62,270)\\fs34\\1c&H00FFFFFF&\\bord0\\shad0`, initiale);
  ecrire(2, 0, total, `\\an4\\pos(112,256)\\fs30\\1c&H00FFFFFF&\\bord0\\shad0`, nomCourt(s.contact));
  dessin(0, total, 0, ZONE.bas, "&H00F0F0F0&", rectangleArrondi(ECRAN.largeur, ECRAN.hauteur - ZONE.bas, 0));
  dessin(0, total, 24, ZONE.bas + 22, "&H00FFFFFF&", rectangleArrondi(ECRAN.largeur - 48, 66, 33));
  ecrire(2, 0, total, `\\an4\\pos(56,${ZONE.bas + 55})\\fs28\\1c&H00A0A0A0&\\bord0\\shad0`, "Message");

  // Statut sous le nom : « écrit… » juste avant chaque message de « lui ».
  const ecrit = s.messages.flatMap((m, i) => (m.de === "lui" ? [[Math.max(ACCROCHE_SEULE * 0.5, debuts[i] - 0.9), debuts[i]] as const] : []));
  let t = 0;
  for (const [a, b] of ecrit) {
    if (a > t) ecrire(2, t, a, `\\an4\\pos(112,292)\\fs22\\1c&H00E0E0E0&\\bord0\\shad0`, "en ligne");
    ecrire(2, a, b, `\\an4\\pos(112,292)\\fs22\\1c&H00E0E0E0&\\bord0\\shad0`, "écrit...");
    t = b;
  }
  if (t < total) ecrire(2, t, total, `\\an4\\pos(112,292)\\fs22\\1c&H00E0E0E0&\\bord0\\shad0`, "en ligne");

  // Bulles : redessinées à chaque défilement, coupées au bord de la zone.
  const clip = `\\clip(0,${ZONE.haut},${ECRAN.largeur},${ZONE.bas})`;
  for (let k = 0; k < liste.length; k++) {
    const debutEtat = debuts[k];
    const finEtat = k + 1 < liste.length ? debuts[k + 1] : total;
    const decalage = defilement(liste, k);
    for (let i = 0; i <= k; i++) {
      const b = liste[i];
      const y = b.y - decalage;
      if (y + b.h < ZONE.haut) continue;
      const nouveau = i === k ? "\\fad(150,0)" : "";
      dessin(debutEtat, finEtat, b.x, y, b.de === "moi" ? COULEURS.moi : COULEURS.lui, rectangleArrondi(b.l, b.h, 22), `${clip}${nouveau}`);
      ecrire(3, debutEtat, finEtat, `\\an7\\pos(${b.x + 22},${y + 20})\\fs32\\1c${COULEURS.texte}\\bord0\\shad0${clip}${nouveau}`, b.lignes.join("\\N"));
      ecrire(3, debutEtat, finEtat, `\\an3\\pos(${b.x + b.l - 16},${y + b.h - 8})\\fs18\\1c${COULEURS.heure}\\bord0\\shad0${clip}${nouveau}`, heure);
    }
    // Bulle « … » de saisie avant le prochain message de « lui ».
    const suivant = s.messages[k + 1];
    if (suivant?.de === "lui") {
      const prochaine = liste[k + 1];
      const y = prochaine.y - decalage;
      const a = Math.max(debutEtat + 0.2, debuts[k + 1] - 0.9);
      if (y + 60 <= ZONE.bas && a < debuts[k + 1]) {
        dessin(a, debuts[k + 1], 28, y, COULEURS.lui, rectangleArrondi(110, 60, 22), clip);
        ecrire(3, a, debuts[k + 1], `\\an5\\pos(83,${y + 26})\\fs40\\1c&H00909090&\\bord0\\shad0${clip}`, "...");
      }
    }
  }

  // Carte finale : la chute et la question qui fait commenter.
  dessin(finMessages, total, 0, 0, "&H00000000&", rectangleArrondi(ECRAN.largeur, ECRAN.hauteur, 0), "\\1a&H12&\\fad(250,0)", 5);
  const chute = couper(s.chute, 620, 52).join("\\N");
  const question = couper(s.question, 620, 40).join("\\N");
  ecrire(6, finMessages, total, `\\an5\\pos(360,560)\\fs52\\1c&H00FFFFFF&\\bord3\\3c&H00000000&\\shad0\\fad(250,0)`, chute);
  ecrire(6, finMessages + 0.6, total, `\\an5\\pos(360,760)\\fs40\\1c&H0000D7FF&\\bord3\\3c&H00000000&\\shad0\\fad(200,0)`, question);

  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${ECRAN.largeur}
PlayResY: ${ECRAN.hauteur}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Texte,DejaVu Sans,32,&H00202020,&H00202020,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${ev.join("\n")}
`;
}

// Instants des « pops » de notification (un par message), pour le son.
export const instantsSons = (s: ScriptConversation) => minutage(s.messages).debuts;

export { ass as tempsAss };
