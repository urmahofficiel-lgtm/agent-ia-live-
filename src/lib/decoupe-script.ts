// Script des vidéos « Histoire » en papier découpé (voir decoupe.ts) : une
// histoire VRAIE du monde de la construction, de l'architecture ou de leur
// histoire, racontée en 5 à 7 plans. La marque n'est jamais nommée dans
// l'histoire : elle n'apparaît que sur la dernière image (plan ajouté ici).
import { NOMS_ICONES_DECOUPE } from "./decoupe-icones";
import type { PlanDecoupe } from "./decoupe";
import { texteInvente } from "./explication-script";

// Ligne qui marque la consigne d'une publication « histoire » : le moteur y
// reconnaît le format, quel que soit le style vidéo par défaut.
export const MARQUE_HISTOIRE = "Format vidéo : histoire vraie du monde de la construction, en papier découpé.";
export const estHistoire = (consigne: string | null | undefined) => Boolean(consigne?.includes(MARQUE_HISTOIRE));

// Même style « papier découpé » pour présenter la marque elle-même.
export const MARQUE_PRESENTATION = "Format vidéo : présentation de la marque en papier découpé.";
export const estPresentation = (consigne: string | null | undefined) => Boolean(consigne?.includes(MARQUE_PRESENTATION));
export const estDecoupe = (consigne: string | null | undefined) => estHistoire(consigne) || estPresentation(consigne);

export type Source = { titre: string; url: string; texte: string };
export type PlanHistoire = Omit<PlanDecoupe, "duree" | "carte" | "photo"> & { recherche_photo?: string };
export type ScriptHistoire = { plans: PlanHistoire[]; legende: string };

const court = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export function consigneHistoire(sujet: string, sources: Source[], marque: string) {
  return `Écris le script d'une vidéo TikTok verticale de 25 à 35 secondes qui raconte UNE histoire vraie du monde de la construction, de l'architecture ou de leur histoire, en français, pour des artisans, des architectes et des gens du bâtiment. Format « papier découpé » : un plan toutes les 3 à 5 secondes, une coupure de journal et deux icônes par plan.
Sujet : ${sujet}

Sources (SEULE source de vérité : n'écris aucun fait, date, nombre ni nom qui n'y figure pas) :
${sources.slice(0, 4).map((s, i) => `[${i + 1}] ${s.titre} — ${s.texte.slice(0, 800)}`).join("\n\n")}

Structure : plan 1 = accroche qui arrête le défilement (le paradoxe, le chiffre ou l'exploit de l'histoire) ; puis le contexte, l'obstacle, le tournant, le résultat ; le dernier plan donne ce que ça nous apprend pour un chantier. Ne parle JAMAIS de « ${marque} » ni d'un produit, d'un logiciel ou d'une marque : l'appel à l'action est ajouté automatiquement après ton dernier plan.
Chaque plan :
- "titre" : titre de la coupure de journal EN FRANÇAIS, MAJUSCULES, 34 caractères au plus, 3 à 6 mots, sans astérisques (le dernier mot sera surligné) ;
- "extrait" : une phrase de la coupure EN FRANÇAIS (traduis les sources étrangères), tutoiement, 95 caractères au plus, sans astérisques ;
- "phrase" : la phrase dite par la voix off, 6 à 12 mots, tutoiement ou ton neutre, mets UN mot clé entre *astérisques* ;
- "icones" : une ou deux icônes parmi : ${NOMS_ICONES_DECOUPE.join(", ")} ;
- "photo" : 2 à 4 mots-clés EN ANGLAIS pour trouver sur Pexels une photo réelle d'UN seul sujet net, détouré ensuite sur fond kraft : de préférence le monument lui-même (ex. "Eiffel Tower", "Empire State Building"), sinon ce dont parle le plan (ex. "construction worker", "steel beam", "crane", "architect blueprint", "vintage radio"). Évite les paysages, les foules et les vues d'ensemble. Vide si rien ne s'y prête.
Règles strictes : un chiffre, une date ou une durée n'apparaît QUE s'il figure dans les sources ; si les sources se contredisent sur un chiffre, écris « environ » ou n'écris pas le chiffre ; aucune exagération (« le plus grand du monde ») sans source ; pas de promesse, pas de politique, pas de religion, pas d'insulte.
"legende" : légende TikTok, 2 phrases qui donnent envie de réagir + une question + 3 hashtags (#construction #architecture #histoire), sans nom de marque ni lien.
Réponds uniquement en JSON : {"plans":[{"titre":"…","extrait":"…","phrase":"…","icones":["…","…"],"photo":"…"}],"legende":"…"}`;
}

export function consignePresentation(sujet: string, fiche: string, marque: string) {
  return `Écris le script d'une vidéo TikTok verticale de 25 à 35 secondes qui présente « ${marque} » à des artisans, des PME du bâtiment et des architectes, en français. Format « papier découpé » : un plan toutes les 3 à 5 secondes, une coupure de journal, une photo détourée et une icône par plan.
Sujet : ${sujet}

Fiche de la marque (SEULE source de vérité : n'écris aucune fonction, aucun prix, aucun chiffre ni témoignage qui n'y figure pas) :
${fiche.slice(0, 3000)}

Structure : plan 1 = la douleur du chantier qui arrête le défilement (le devis du soir, la facture qui bloque, la paperasse) ; puis 3 à 4 plans, chacun UNE fonction réelle de la fiche montrée par un geste concret du chantier ; le dernier plan donne le bénéfice. L'appel à l'action final est ajouté automatiquement : ne l'écris pas.
Chaque plan :
- "titre" : titre de la coupure de journal EN FRANÇAIS, MAJUSCULES, 34 caractères au plus, 3 à 6 mots, sans astérisques (le dernier mot sera surligné) ;
- "extrait" : une phrase de la coupure EN FRANÇAIS (traduis les sources étrangères), tutoiement, 95 caractères au plus, sans astérisques ;
- "phrase" : la phrase dite par la voix off, 6 à 14 mots, tutoiement, ton direct de chantier ; mets UN mot clé entre *astérisques* ;
- "icones" : une ou deux icônes parmi : ${NOMS_ICONES_DECOUPE.join(", ")} ;
- "photo" : 2 à 4 mots-clés EN ANGLAIS pour trouver sur Pexels une photo réelle d'UN seul sujet net, détouré ensuite (ex. "construction worker smartphone", "builder tablet", "craftsman paperwork", "hard hat"). Évite les paysages et les foules.
Règles strictes : un chiffre n'apparaît QUE s'il figure dans la fiche ; pas de promesse (« garanti », « 100 % », « zéro erreur ») ; n'invente aucun client ni résultat.
"legende" : légende TikTok, 2 phrases + une question + 3 hashtags métier (#btp #artisan #chantier), qui finit par « Lien en bio ».
Réponds uniquement en JSON : {"plans":[{"titre":"…","extrait":"…","phrase":"…","icones":["…","…"],"photo":"…"}],"legende":"…"}`;
}

// Coupure recopiée d'une source anglaise (« Construction started on… ») : refusée.
const MOTS_ANGLAIS = /\b(the|and|was|were|of the|during|started|completed|building|ahead|opened|officially)\b/gi;
export const enAnglais = (t: string) => (t.match(MOTS_ANGLAIS) ?? []).length >= 2;

export function lireHistoire(reponse: string, sources: string, interdits: string[] = []): ScriptHistoire | null {
  const debut = reponse.indexOf("{");
  const fin = reponse.lastIndexOf("}");
  if (debut === -1 || fin <= debut) return null;
  const marqueDite = (t: string) => interdits.some((m) => m && t.toLowerCase().includes(m.toLowerCase()));
  try {
    const j = JSON.parse(reponse.slice(debut, fin + 1)) as { plans?: unknown[]; legende?: unknown };
    const plans = (j.plans ?? []).flatMap((p): PlanHistoire[] => {
      const o = (p ?? {}) as Record<string, unknown>;
      // Les astérisques ne servent qu'à la phrase dite : jamais dans le journal.
      const titre = court(o.titre, 36).replace(/\*/g, "").toUpperCase();
      const extrait = court(o.extrait, 100).replace(/\*/g, "");
      if (enAnglais(extrait) || enAnglais(titre)) return [];
      const phrase = court(o.phrase, 120);
      const noms = (Array.isArray(o.icones) ? o.icones : []).map((x) => String(x)).filter((x) => NOMS_ICONES_DECOUPE.includes(x));
      if (!titre || !extrait || !phrase || !noms.length) return [];
      const tout = `${titre} ${extrait} ${phrase.replace(/\*/g, "")}`;
      if (texteInvente(tout, sources) || marqueDite(tout)) return [];
      const recherche_photo = court(o.photo, 40).replace(/[^A-Za-z ]/g, "").trim() || undefined;
      return [{ titre, extrait, phrase, icones: [noms[0], noms[1]], recherche_photo }];
    });
    if (plans.length < 5) return null;
    const legende = court(j.legende, 600);
    return { plans: plans.slice(0, 7), legende: texteInvente(legende, sources) || marqueDite(legende) ? "" : legende };
  } catch {
    return null;
  }
}

// Dernier plan : seul endroit où la marque est nommée et proposée.
export function planFinal(marque: string, site: string, essai: string): Omit<PlanDecoupe, "duree"> {
  return {
    titre: marque.toUpperCase(),
    extrait: "",
    phrase: `Pour tes propres chantiers, essaie *${marque}* gratuitement.`,
    icones: ["House"],
    carte: { grand: marque, petits: ["DEVIS · FACTURES · SUIVI", essai], site: site.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "") },
  };
}
