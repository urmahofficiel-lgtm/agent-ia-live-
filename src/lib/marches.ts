// Marchés (langue + pays) : chaque compte connecté publie pour un marché.
// Une page « BTP Ecosystem Italia » reçoit des posts, des visuels et des
// vidéos en italien, avec des hashtags italiens. Logique pure, partagée par
// le moteur, l'interface et les tests.

export type Marche = {
  id: string;
  // Nom affiché dans l'interface (dans la langue du marché).
  libelle: string;
  drapeau: string;
  // Pour les consignes données à l'IA (en français).
  langue: string;
  pays: string;
  // Pour les consignes d'images (en anglais).
  paysAnglais: string;
  // Décalage horaire avec Paris, en minutes : un créneau « 08:30 » tombe à
  // 08:30 heure locale.
  decalage: number;
  // Textes fixes des visuels et vidéos faits sans IA (IA saturée).
  mots: {
    decouvrir: string;
    enSavoirPlus: string;
    essayer: string;
    // « {m} » : la marque, « {l} » : le site.
    decouvrezSur: string;
    decouvrez: string;
    // Repères affichés dans les vidéos « avant / après » et « étapes ».
    avant: string;
    apres: string;
    etape: string;
  };
};

export const MARCHE_DEFAUT = "fr-FR";

export const MARCHES: Marche[] = [
  {
    id: "fr-FR",
    libelle: "Français — France",
    drapeau: "🇫🇷",
    langue: "français",
    pays: "France",
    paysAnglais: "France",
    decalage: 0,
    mots: {
      decouvrir: "À découvrir",
      enSavoirPlus: "En savoir plus",
      essayer: "Essayez maintenant",
      decouvrezSur: "Découvrez {m} sur {l}",
      decouvrez: "Découvrez {m}",
      avant: "AVANT",
      apres: "APRÈS",
      etape: "ÉTAPE",
    },
  },
  {
    id: "en-GB",
    libelle: "English — United Kingdom",
    drapeau: "🇬🇧",
    langue: "anglais britannique",
    pays: "Royaume-Uni",
    paysAnglais: "the United Kingdom",
    decalage: 60,
    mots: {
      decouvrir: "Discover",
      enSavoirPlus: "Learn more",
      essayer: "Try it now",
      decouvrezSur: "Discover {m} at {l}",
      decouvrez: "Discover {m}",
      avant: "BEFORE",
      apres: "AFTER",
      etape: "STEP",
    },
  },
  {
    id: "es-ES",
    libelle: "Español — España",
    drapeau: "🇪🇸",
    langue: "espagnol d'Espagne",
    pays: "Espagne",
    paysAnglais: "Spain",
    decalage: 0,
    mots: {
      decouvrir: "Descubre",
      enSavoirPlus: "Más información",
      essayer: "Pruébalo ahora",
      decouvrezSur: "Descubre {m} en {l}",
      decouvrez: "Descubre {m}",
      avant: "ANTES",
      apres: "DESPUÉS",
      etape: "PASO",
    },
  },
  {
    id: "it-IT",
    libelle: "Italiano — Italia",
    drapeau: "🇮🇹",
    langue: "italien",
    pays: "Italie",
    paysAnglais: "Italy",
    decalage: 0,
    mots: {
      decouvrir: "Da scoprire",
      enSavoirPlus: "Scopri di più",
      essayer: "Provalo ora",
      decouvrezSur: "Scopri {m} su {l}",
      decouvrez: "Scopri {m}",
      avant: "PRIMA",
      apres: "DOPO",
      etape: "PASSO",
    },
  },
  {
    id: "de-DE",
    libelle: "Deutsch — Deutschland",
    drapeau: "🇩🇪",
    langue: "allemand",
    pays: "Allemagne",
    paysAnglais: "Germany",
    decalage: 0,
    mots: {
      decouvrir: "Entdecken",
      enSavoirPlus: "Mehr erfahren",
      essayer: "Jetzt testen",
      decouvrezSur: "Entdecke {m} auf {l}",
      decouvrez: "Entdecke {m}",
      avant: "VORHER",
      apres: "NACHHER",
      etape: "SCHRITT",
    },
  },
  {
    id: "pt-PT",
    libelle: "Português — Portugal",
    drapeau: "🇵🇹",
    langue: "portugais du Portugal",
    pays: "Portugal",
    paysAnglais: "Portugal",
    decalage: 60,
    mots: {
      decouvrir: "Descubra",
      enSavoirPlus: "Saiba mais",
      essayer: "Experimente agora",
      decouvrezSur: "Descubra {m} em {l}",
      decouvrez: "Descubra {m}",
      avant: "ANTES",
      apres: "DEPOIS",
      etape: "PASSO",
    },
  },
  {
    id: "nl-NL",
    libelle: "Nederlands — Nederland",
    drapeau: "🇳🇱",
    langue: "néerlandais",
    pays: "Pays-Bas",
    paysAnglais: "the Netherlands",
    decalage: 0,
    mots: {
      decouvrir: "Ontdek",
      enSavoirPlus: "Meer weten",
      essayer: "Probeer het nu",
      decouvrezSur: "Ontdek {m} op {l}",
      decouvrez: "Ontdek {m}",
      avant: "VOOR",
      apres: "NA",
      etape: "STAP",
    },
  },
];

export const marcheDe = (id: string | null | undefined): Marche =>
  MARCHES.find((m) => m.id === id) ?? MARCHES[0];

export const estEtranger = (id: string | null | undefined) =>
  marcheDe(id).id !== MARCHE_DEFAUT;

// Consigne ajoutée à chaque demande d'écriture pour un marché étranger
// (post, textes d'un visuel, script vidéo). Vide pour la France.
export function reglesMarche(id: string | null | undefined): string {
  const m = marcheDe(id);
  if (m.id === MARCHE_DEFAUT) return "";
  return `Marché visé : ${m.pays}. Règles de langue (prioritaires sur toute autre consigne de langue) :
- Écris TOUT le texte en ${m.langue}, comme un natif du métier dans ce pays : naturel, pas une traduction mot à mot. Aucun mot de français.
- Traduis aussi les formules imposées (par exemple « Essai gratuit : lien sur notre page », « lien en bio »).
- Hashtags en ${m.langue}, ceux que la clientèle visée utilise vraiment en ${m.pays} : n'utilise pas les hashtags français de la fiche.
- Ne parle d'aucune loi, norme ou obligation (ni française comme Factur-X, la réforme 2026 ou le FEC, ni du pays visé) : parle du travail au quotidien et des bénéfices.
- Garde le nom de la marque tel quel.`;
}

// Consigne système pour l'IA (sinon : « Tu écris en français »).
export function systemeMarche(
  id: string | null | undefined,
): string | undefined {
  const m = marcheDe(id);
  if (m.id === MARCHE_DEFAUT) return undefined;
  return `Tu es l'assistant marketing d'une entreprise qui s'adresse aux professionnels en ${m.pays}. Tu écris en ${m.langue}, de façon naturelle et concrète, comme un natif. Tu ne réponds qu'avec le contenu demandé, sans commentaire autour, sans guillemets englobants.`;
}

// Manière de lire la voix off, dans la langue du marché.
export function tonVoix(id: string | null | undefined, parle: boolean): string {
  const m = marcheDe(id);
  const voix = m.id === MARCHE_DEFAUT ? "française" : `en ${m.langue}`;
  return parle
    ? `voix ${voix} naturelle et enjouée, comme une personne qui parle face caméra sur TikTok : spontanée, rythme rapide, sourire dans la voix`
    : `voix off publicitaire ${voix}, dynamique et chaleureuse`;
}

// Canaux du pilote automatique : un par réseau et par marché des comptes
// connectés (« facebook » en France, « facebook » en Italie…). `en_plus` :
// autres langues que ce compte publie aussi (un post de plus par jour, une
// langue à tour de rôle).
export type Canal = { plateforme: string; marche: string; en_plus?: string[] };

const idsValides = (brut: unknown): string[] =>
  Array.isArray(brut)
    ? brut.filter(
        (m): m is string =>
          typeof m === "string" && MARCHES.some((x) => x.id === m),
      )
    : [];

export function lireCanaux(brut: unknown): Canal[] {
  if (!Array.isArray(brut)) return [];
  const canaux = new Map<string, Canal>();
  for (const x of brut) {
    const plateforme = typeof x?.plateforme === "string" ? x.plateforme : "";
    if (!plateforme) continue;
    const marche = marcheDe(typeof x?.marche === "string" ? x.marche : null).id;
    const cle = `${plateforme}|${marche}`;
    const avant = canaux.get(cle);
    const en_plus = [
      ...new Set([...(avant?.en_plus ?? []), ...idsValides(x?.en_plus)]),
    ].filter((m) => m !== marche);
    canaux.set(cle, { plateforme, marche, en_plus });
  }
  return [...canaux.values()];
}

// Langue du post en plus du jour : une à tour de rôle (même ordre chaque
// jour, décalé d'un cran), sauf celles qui ont déjà leur propre compte.
export function langueDuJour(
  enPlus: string[] | undefined,
  jour: string,
  exclues: string[] = [],
): string | null {
  const liste = MARCHES.map((m) => m.id).filter(
    (id) => (enPlus ?? []).includes(id) && !exclues.includes(id),
  );
  if (!liste.length) return null;
  const numero = Math.floor(Date.parse(`${jour}T00:00:00Z`) / 86_400_000);
  return liste[((numero % liste.length) + liste.length) % liste.length];
}

// Compte qui publie une publication de ce marché : un compte dédié au pays
// d'abord, sinon un compte qui publie aussi dans cette langue.
export function choisirCompte<
  T extends { marche?: string | null; langues_en_plus?: string[] | null },
>(comptes: T[], marche: string | null | undefined): T | null {
  const m = marcheDe(marche).id;
  return (
    comptes.find((c) => marcheDe(c.marche).id === m) ??
    comptes.find((c) => (c.langues_en_plus ?? []).includes(m)) ??
    null
  );
}

// « Scopri BTP Ecosystem su btp-ecosystem.com. » : dernière phrase d'une vidéo
// faite sans IA.
export function phraseDecouvrir(
  id: string | null | undefined,
  marque: string,
  lien: string,
): string {
  const m = marcheDe(id).mots;
  if (!marque) return `${m.essayer}.`;
  return `${(lien ? m.decouvrezSur : m.decouvrez).replace("{m}", marque).replace("{l}", lien)}.`;
}

// Consigne d'image (en anglais) : le décor du pays visé, rien de français.
export function decorMarche(id: string | null | undefined): string {
  const m = marcheDe(id);
  if (m.id === MARCHE_DEFAUT) return "";
  return `Audience: the brand's customers in ${m.paysAnglais}. The setting must look like ${m.paysAnglais}; nothing specifically French (no French flags, signs, plates or text).`;
}
