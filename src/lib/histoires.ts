// Agent « Histoires du jour » (accord de Younes du 21/11/2026) : chaque matin
// il choisit une grande construction du monde ou de France, réunit les faits
// sourcés (années, architectes, entreprises, ouvriers, coût, durée,
// anecdotes) dans une fiche, et prépare la vidéo « Histoire » du soir.
// Logique pure, testable ; la recherche web est dans la route.
import { texteInvente } from "./explication-script";
import { choquant, MARQUE_HISTOIRE } from "./decoupe-script";

export type Sujet = { cle: string; nom: string; recherche: string };

// Ordre voulu : on alterne monde et France, monuments, records et quartiers.
export const SUJETS: Sujet[] = [
  { cle: "pyramide-kheops", nom: "La pyramide de Khéops", recherche: "pyramide de Khéops Gizeh" },
  { cle: "tour-eiffel", nom: "La tour Eiffel", recherche: "tour Eiffel" },
  { cle: "burj-khalifa", nom: "La Burj Khalifa", recherche: "Burj Khalifa Dubaï" },
  { cle: "viaduc-millau", nom: "Le viaduc de Millau", recherche: "viaduc de Millau" },
  { cle: "empire-state-building", nom: "L'Empire State Building", recherche: "Empire State Building New York" },
  { cle: "tunnel-sous-la-manche", nom: "Le tunnel sous la Manche", recherche: "tunnel sous la Manche Eurotunnel" },
  { cle: "golden-gate", nom: "Le Golden Gate Bridge", recherche: "Golden Gate Bridge San Francisco" },
  { cle: "paris-haussmann", nom: "Le Paris d'Haussmann", recherche: "travaux haussmanniens Paris Second Empire" },
  { cle: "sagrada-familia", nom: "La Sagrada Família", recherche: "Sagrada Família Barcelone Gaudí" },
  { cle: "notre-dame-reconstruction", nom: "La reconstruction de Notre-Dame de Paris", recherche: "chantier reconstruction Notre-Dame de Paris après l'incendie" },
  { cle: "canal-de-panama", nom: "Le canal de Panama", recherche: "canal de Panama" },
  { cle: "pont-du-gard", nom: "Le pont du Gard", recherche: "pont du Gard aqueduc romain" },
  { cle: "colisee", nom: "Le Colisée de Rome", recherche: "Colisée Rome amphithéâtre Flavien" },
  { cle: "chateau-de-versailles", nom: "Le château de Versailles", recherche: "château de Versailles construction Louis XIV" },
  { cle: "grande-muraille", nom: "La Grande Muraille de Chine", recherche: "Grande Muraille de Chine" },
  { cle: "la-defense", nom: "Le quartier de La Défense", recherche: "quartier d'affaires La Défense" },
  { cle: "opera-sydney", nom: "L'opéra de Sydney", recherche: "opéra de Sydney Jørn Utzon" },
  { cle: "opera-garnier", nom: "L'opéra Garnier", recherche: "opéra Garnier Charles Garnier" },
  { cle: "taj-mahal", nom: "Le Taj Mahal", recherche: "Taj Mahal Agra" },
  { cle: "pyramide-du-louvre", nom: "La pyramide du Louvre", recherche: "pyramide du Louvre Ieoh Ming Pei" },
  { cle: "hoover-dam", nom: "Le barrage Hoover", recherche: "barrage Hoover Dam" },
  { cle: "mont-saint-michel", nom: "L'abbaye du Mont-Saint-Michel", recherche: "abbaye du Mont-Saint-Michel" },
  { cle: "brooklyn-bridge", nom: "Le pont de Brooklyn", recherche: "pont de Brooklyn Roebling" },
  { cle: "centre-pompidou", nom: "Le Centre Pompidou", recherche: "Centre Pompidou Renzo Piano Richard Rogers" },
  { cle: "petronas", nom: "Les tours Petronas", recherche: "tours Petronas Kuala Lumpur" },
  { cle: "arc-de-triomphe", nom: "L'Arc de Triomphe", recherche: "Arc de Triomphe de l'Étoile" },
  { cle: "coupole-florence", nom: "La coupole de Florence", recherche: "coupole de Brunelleschi Santa Maria del Fiore" },
  { cle: "canal-du-midi", nom: "Le canal du Midi", recherche: "canal du Midi Pierre-Paul Riquet" },
  { cle: "palm-jumeirah", nom: "Palm Jumeirah", recherche: "Palm Jumeirah île artificielle Dubaï" },
  { cle: "grande-arche", nom: "La Grande Arche de La Défense", recherche: "Grande Arche de La Défense" },
  { cle: "chrysler-building", nom: "Le Chrysler Building", recherche: "Chrysler Building" },
  { cle: "chambord", nom: "Le château de Chambord", recherche: "château de Chambord" },
  { cle: "machu-picchu", nom: "Le Machu Picchu", recherche: "Machu Picchu Incas" },
  { cle: "stade-de-france", nom: "Le Stade de France", recherche: "Stade de France construction 1998" },
  { cle: "guggenheim-bilbao", nom: "Le musée Guggenheim de Bilbao", recherche: "musée Guggenheim Bilbao Frank Gehry" },
  { cle: "pont-de-normandie", nom: "Le pont de Normandie", recherche: "pont de Normandie" },
  { cle: "sainte-sophie", nom: "Sainte-Sophie d'Istanbul", recherche: "Sainte-Sophie Istanbul Justinien" },
  { cle: "cathedrale-chartres", nom: "La cathédrale de Chartres", recherche: "cathédrale de Chartres construction" },
  { cle: "barrage-trois-gorges", nom: "Le barrage des Trois-Gorges", recherche: "barrage des Trois-Gorges" },
  { cle: "fort-boyard", nom: "Fort Boyard", recherche: "Fort Boyard construction" },
  { cle: "petra", nom: "Pétra", recherche: "Pétra Jordanie cité nabatéenne" },
  { cle: "mucem", nom: "Le MuCEM de Marseille", recherche: "MuCEM Rudy Ricciotti" },
  { cle: "tunnel-gothard", nom: "Le tunnel de base du Saint-Gothard", recherche: "tunnel de base du Saint-Gothard" },
  { cle: "tour-montparnasse", nom: "La tour Montparnasse", recherche: "tour Montparnasse construction" },
  { cle: "christ-redempteur", nom: "Le Christ Rédempteur de Rio", recherche: "Christ Rédempteur Corcovado construction" },
  { cle: "grand-paris-express", nom: "Le Grand Paris Express", recherche: "chantier Grand Paris Express" },
  { cle: "brasilia", nom: "Brasília, une ville sortie de terre", recherche: "construction de Brasília Oscar Niemeyer Lúcio Costa" },
  { cle: "philharmonie-paris", nom: "La Philharmonie de Paris", recherche: "Philharmonie de Paris Jean Nouvel" },
  { cle: "angkor-vat", nom: "Angkor Vat", recherche: "Angkor Vat temple" },
  { cle: "atomium", nom: "L'Atomium de Bruxelles", recherche: "Atomium Bruxelles Expo 58" },
];

export const choisirSujet = (deja: readonly string[]) => SUJETS.find((s) => !deja.includes(s.cle)) ?? null;

// 3 recherches (fond, acteurs et chiffres) : sous l'offre gratuite de Tavily.
export const requetesSujet = (s: Sujet) => [
  `${s.recherche} histoire construction`,
  `${s.recherche} architecte entreprises nombre d'ouvriers chantier`,
  `${s.recherche} coût de construction durée des travaux`,
];

export type SourceWeb = { titre: string; url: string; texte: string };

export type Fiche = {
  nom: string;
  lieu: string | null;
  periode: string | null; // « 1887-1889 »
  duree: string | null;
  architectes: string[];
  entreprises: string[];
  ouvriers: string | null;
  cout: string | null; // avec la monnaie et l'époque, « selon … »
  chiffres: string[]; // autres chiffres clés
  anecdotes: string[];
  accroche: string | null; // le fait le plus étonnant
};

export function consigneFiche(s: Sujet, sources: SourceWeb[]) {
  return `Tu es documentaliste. À partir des SEULES sources ci-dessous, fais la fiche de « ${s.nom} » pour une vidéo grand public sur l'histoire de la construction.
${sources.map((x, i) => `[${i + 1}] ${x.titre} (${x.url})\n${x.texte.slice(0, 1500)}`).join("\n\n")}

Champs (en français ; null ou liste vide si les sources ne le disent pas, n'invente RIEN) :
- "nom", "lieu", "periode" (années de début et de fin des travaux), "duree" (durée du chantier) ;
- "architectes" (noms des architectes ou ingénieurs), "entreprises" (entreprises ou corps qui ont construit) ;
- "ouvriers" (nombre de personnes sur le chantier, avec « environ » si les sources l'estiment) ;
- "cout" (coût de construction avec la monnaie et l'époque, ex. « 7,8 millions de francs-or de l'époque ») ;
- "chiffres" : 2 à 5 autres chiffres clés (hauteur, poids, matériaux…) ;
- "anecdotes" : 2 à 4 faits surprenants sur le CHANTIER (techniques, ouvriers, records, imprévus), chacun en une phrase ; jamais d'anecdote sexuelle, violente ou scabreuse ;
- "accroche" : le fait le plus étonnant, en une phrase.
Chaque chiffre ou date doit figurer tel quel dans une source. Si deux sources se contredisent, garde la fourchette (« entre … et … ») ou « environ ».
Réponds uniquement en JSON avec ces clés.`;
}

const txt = (v: unknown, max: number) => (typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "null" ? v.replace(/\s+/g, " ").trim().slice(0, max) : null);
const liste = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.map((x) => txt(x, max)).filter((x): x is string => Boolean(x)).slice(0, n) : []);

// Fiche lue ; tout élément dont un chiffre n'est pas dans les sources est écarté.
export function lireFiche(reponse: string, s: Sujet, textes: string): Fiche | null {
  const debut = reponse.indexOf("{");
  const fin = reponse.lastIndexOf("}");
  if (debut === -1 || fin <= debut) return null;
  try {
    const j = JSON.parse(reponse.slice(debut, fin + 1)) as Record<string, unknown>;
    const sur = (x: string | null) => (x && !texteInvente(x, textes) && !choquant(x) ? x : null);
    const surs = (l: string[]) => l.filter((x) => !texteInvente(x, textes) && !choquant(x));
    const f: Fiche = {
      nom: txt(j.nom, 120) ?? s.nom,
      lieu: sur(txt(j.lieu, 120)),
      periode: sur(txt(j.periode, 60)),
      duree: sur(txt(j.duree, 80)),
      architectes: liste(j.architectes, 6, 80),
      entreprises: liste(j.entreprises, 6, 100),
      ouvriers: sur(txt(j.ouvriers, 120)),
      cout: sur(txt(j.cout, 200)),
      chiffres: surs(liste(j.chiffres, 5, 160)),
      anecdotes: surs(liste(j.anecdotes, 4, 240)),
      accroche: sur(txt(j.accroche, 240)),
    };
    const faits = [f.periode, f.duree, f.ouvriers, f.cout, f.accroche].filter(Boolean).length + f.chiffres.length + f.anecdotes.length + (f.architectes.length ? 1 : 0);
    return faits >= 4 ? f : null;
  } catch {
    return null;
  }
}

const DEBUT_FICHE = "--- Fiche de recherche (sources vérifiées) ---";
const FIN_FICHE = "--- Fin de la fiche ---";

export function ficheEnTexte(f: Fiche, sources: SourceWeb[]) {
  const l = (nom: string, v: string | null | string[]) => (Array.isArray(v) ? (v.length ? `${nom} : ${v.join(" ; ")}` : "") : v ? `${nom} : ${v}` : "");
  return [
    l("Nom", f.nom),
    l("Lieu", f.lieu),
    l("Période des travaux", f.periode),
    l("Durée du chantier", f.duree),
    l("Architectes / ingénieurs", f.architectes),
    l("Entreprises", f.entreprises),
    l("Ouvriers", f.ouvriers),
    l("Coût", f.cout),
    l("Chiffres clés", f.chiffres),
    l("Anecdotes", f.anecdotes),
    l("Accroche", f.accroche),
    l("Sources", sources.map((s) => s.url)),
  ]
    .filter(Boolean)
    .join("\n");
}

export function consignePublication(s: Sujet, f: Fiche, sources: SourceWeb[]) {
  return `Histoire vraie : ${s.nom}. Raconte son chantier (l'année, l'architecte, les entreprises, combien de personnes y ont travaillé, ce que ça a coûté si on le sait) avec les faits de la fiche, sans rien inventer.
${DEBUT_FICHE}
${ficheEnTexte(f, sources)}
${FIN_FICHE}
${MARQUE_HISTOIRE}`;
}

// Texte de la fiche contenu dans la consigne (source de vérité de la vidéo).
export function ficheDeConsigne(consigne: string | null | undefined) {
  if (!consigne) return null;
  const a = consigne.indexOf(DEBUT_FICHE);
  const b = consigne.indexOf(FIN_FICHE);
  return a !== -1 && b > a ? consigne.slice(a + DEBUT_FICHE.length, b).trim() : null;
}
