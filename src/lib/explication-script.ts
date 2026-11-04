// Script des vidéos « Explication » (voir explication.ts) : l'IA écrit des
// plans courts (titre en 2 lignes, phrase dite, une illustration) ; ce module
// donne la consigne, lit la réponse et cale la durée des plans sur la voix.
import { marcheDe, reglesMarche } from "./marches";
import type { PlanCourt, VisuelExplication } from "./explication";

export type PlanEcrit = Omit<PlanCourt, "duree">;
export type ScriptExplication = { plans: PlanEcrit[]; mot: string; legende: string };

const TYPES = ["chiffre", "liste", "dictee", "sms", "devis", "bouton", "capture"] as const;

export function consigneExplication(
  t: { titre: string; consigne: string; brouillon?: string | null },
  contexte: string | null,
  captures: string[],
  marche?: string | null,
) {
  const regles = reglesMarche(marche);
  return `Écris le script d'une vidéo TikTok verticale de 25 à 40 secondes, en ${marcheDe(marche).langue}, au format « une astuce par jour » : pas de visage, un plan toutes les 2 à 3 secondes.
Sujet : ${t.titre}
${t.consigne ? `Consigne : ${t.consigne}\n` : ""}${t.brouillon ? `Texte de la publication : ${t.brouillon.slice(0, 900)}\n` : ""}${contexte ? `\nFiche de la marque (source de vérité : n'invente aucun fait, prix, chiffre ni témoignage) :\n${contexte.slice(0, 3000)}\n` : ""}${regles ? `\n${regles}\n` : ""}
Structure : plan 1 = accroche qui arrête le défilement (un chiffre, une douleur de chantier, une promesse concrète) ; puis la situation et la solution étape par étape ; un plan avec un vrai bénéfice ; PAS de plan final d'appel à l'action (il est ajouté automatiquement).
Chaque plan :
- "titre1" et "titre2" : le titre à l'écran en 2 lignes, MAJUSCULES, 16 caractères au plus chacune (titre2 = le mot fort, affiché en couleur) ;
- "phrase" : la phrase dite par la voix off, 4 à 12 mots, tutoiement, ton direct de chantier ; mets UN mot clé entre *astérisques* ;
- "visuel" : UNE illustration de la phrase, au choix :
  {"type":"chiffre","valeur":"2 MIN","legende":"depuis le chantier"} (valeur 7 caractères au plus) ;
  {"type":"liste","items":["…","…","…"]} (2 à 4 éléments courts) ;
  {"type":"dictee","texte":"ce que l'artisan dit à voix haute"} ;
  {"type":"sms","contact":"Client · Salle de bain","message":"…","reponse":"…"} ;
  {"type":"devis","lignes":[["Poste","quantité"],…]} (3 à 6 lignes, quantités sans prix) ;
  {"type":"bouton","texte":"Générer le devis"} ;
${
    captures.length
      ? `  {"type":"capture","numero":N} : une vraie capture de l'application, à utiliser pour montrer le produit. Écrans disponibles :\n${captures.map((c, i) => `    ${i + 1}. ${c}`).join("\n")}\n  Choisis l'écran qui montre EXACTEMENT ce que dit la phrase (sinon prends un autre type de visuel) ; chaque écran une seule fois.`
      : "  (pas de capture d'écran disponible : n'utilise pas le type capture)"
  }
Varie les visuels, 8 à 11 plans au total.
Règles strictes : tutoiement partout (titres compris) ; n'écris un chiffre, un pourcentage, une durée, un nombre de pages ou un prix QUE s'il figure mot pour mot dans la fiche ou le texte de la publication ; jamais de promesse ni de garantie (« garanti », « 100 % », « zéro erreur ») ; n'invente aucun résultat client. Les quantités d'un exemple de devis ou d'une dictée sont permises.
"mot" : le mot à commenter pour recevoir le lien (un mot, MAJUSCULES, lié au sujet, ex. DEVIS, FACTURE, CHANTIER).
"legende" : la légende TikTok (2 phrases + 3 hashtags métier), qui finit par « Commente <mot> 👇 ».
Réponds uniquement en JSON : {"plans":[{"titre1":"…","titre2":"…","phrase":"…","visuel":{…}}],"mot":"…","legende":"…"}`;
}

const court = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

function lireVisuel(v: unknown): VisuelExplication | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const type = TYPES.find((x) => x === o.type);
  const liste = (x: unknown, n: number, max: number) => (Array.isArray(x) ? x.map((i) => court(i, max)).filter(Boolean).slice(0, n) : []);
  switch (type) {
    case "chiffre":
      return court(o.valeur, 8) ? { type, valeur: court(o.valeur, 8).toUpperCase(), legende: court(o.legende, 40) || undefined } : null;
    case "liste": {
      const items = liste(o.items, 4, 28);
      return items.length >= 2 ? { type, items } : null;
    }
    case "dictee":
      return court(o.texte, 130) ? { type, texte: court(o.texte, 130) } : null;
    case "sms":
      return court(o.message, 70) ? { type, contact: court(o.contact, 30) || "Client", message: court(o.message, 70), reponse: court(o.reponse, 50) || undefined } : null;
    case "devis": {
      const lignes = (Array.isArray(o.lignes) ? o.lignes : [])
        .map((l) => (Array.isArray(l) ? ([court(l[0], 26), court(l[1], 12)] as [string, string]) : null))
        .filter((l): l is [string, string] => Boolean(l && l[0] && l[1]))
        .slice(0, 6);
      return lignes.length >= 2 ? { type, lignes } : null;
    }
    case "bouton":
      return court(o.texte, 24) ? { type, texte: court(o.texte, 24) } : null;
    case "capture": {
      // Numéro de l'écran choisi, résolu plus tard en fichier (« #n »).
      const n = Number(o.numero);
      return Number.isInteger(n) && n >= 1 ? { type, image: `#${n}`, largeur: 0, hauteur: 0 } : null;
    }
    default:
      return null;
  }
}

// Garde-fou : chiffres absents des sources, garanties et « 100 % » sont refusés
// (sauf dans les exemples de devis, de dictée et de SMS).
const PROMESSE = /garanti|100\s*%|z[ée]ro\s+(erreur|risque|oubli)|sans\s+risque/i;
export function texteInvente(texte: string, sources: string) {
  if (PROMESSE.test(texte)) return true;
  const connus = new Set(sources.match(/\d+/g) ?? []);
  return (texte.match(/\d+/g) ?? []).some((n) => !connus.has(n));
}
const texteVerifie = (v: VisuelExplication) =>
  v.type === "chiffre" ? `${v.valeur} ${v.legende ?? ""}` : v.type === "liste" ? v.items.join(" ") : v.type === "bouton" ? v.texte : "";

export function lireExplication(reponse: string, captures: number, sources = ""): ScriptExplication | null {
  const debut = reponse.indexOf("{");
  const fin = reponse.lastIndexOf("}");
  if (debut === -1 || fin <= debut) return null;
  try {
    const j = JSON.parse(reponse.slice(debut, fin + 1)) as { plans?: unknown[]; mot?: unknown; legende?: unknown };
    const vus = new Set<string>();
    const plans = (j.plans ?? []).flatMap((p): PlanEcrit[] => {
      const o = (p ?? {}) as Record<string, unknown>;
      const visuel = lireVisuel(o.visuel);
      const t1 = court(o.titre1, 18).toUpperCase();
      const t2 = court(o.titre2, 18).toUpperCase();
      const phrase = court(o.phrase, 110);
      if (!visuel || !t1 || !t2 || !phrase) return [];
      if (texteInvente(`${t1} ${t2} ${phrase.replace(/\*/g, "")} ${texteVerifie(visuel)}`, sources)) return [];
      // Écran inexistant ou déjà montré : le plan est écarté.
      if (visuel.type === "capture" && (Number(visuel.image.slice(1)) > captures || vus.has(visuel.image) || !vus.add(visuel.image))) return [];
      return [{ titre: [t1, t2], phrase, visuel }];
    });
    const mot = (court(j.mot, 12).toUpperCase().match(/[A-ZÀ-Ÿ0-9]+/)?.[0] ?? "INFO").slice(0, 12);
    if (plans.length < 5) return null;
    const legende = court(j.legende, 600);
    return { plans: plans.slice(0, 11), mot, legende: texteInvente(legende, sources) ? "" : legende };
  } catch {
    return null;
  }
}

// Texte complet lu par la voix off (astérisques retirés), plan final compris.
export const phraseFinale = (mot: string) => `Commente *${mot}*, on te répond avec le lien.`;
export const texteVoix = (plans: { phrase: string }[]) => plans.map((p) => p.phrase.replace(/\*/g, "")).join(" ");

// Durée de chaque plan : part de la voix proportionnelle à sa phrase, 1,8 s au
// moins ; le dernier plan garde 1,2 s de plus pour l'appel à l'action.
export function dureesSurVoix(phrases: string[], dureeVoix: number) {
  const poids = phrases.map((p) => Math.max(8, p.replace(/\*/g, "").length));
  const somme = poids.reduce((a, b) => a + b, 0);
  return poids.map((p, i) => Math.round((Math.max(1.8, (p / somme) * dureeVoix) + (i === phrases.length - 1 ? 1.2 : 0)) * 100) / 100);
}

// Description de secours tirée du nom du fichier (« 03-metre-ia.jpg » → « metre ia »).
export const descriptionDuNom = (nom: string) =>
  (nom.split("/").pop() ?? nom).replace(/\.[a-z0-9]+$/i, "").replace(/^\d+[-_ ]*/, "").replace(/[-_]+/g, " ").trim() || "écran de l'application";

export const consigneDescriptionCapture = () =>
  "Cette image est une capture d'écran de l'application de la marque. Décris en une phrase courte (15 mots au plus) l'écran et ce qu'on y fait, en commençant par son nom (ex. « Écran Devis IA : dicter le chantier puis générer le devis »). Réponds uniquement par la phrase.";
