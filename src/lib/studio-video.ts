// Studio vidéo IA : image + consigne → vidéo (Grok Imagine, xAI). Règles
// pures (durées, découpage en morceaux, coût, lecture des réponses).

export const DUREES = [10, 15, 20, 30] as const;
export type Duree = (typeof DUREES)[number];

export const FORMATS = [
  { id: "9:16", nom: "Vertical (TikTok, Reels)" },
  { id: "16:9", nom: "Horizontal (YouTube)" },
  { id: "1:1", nom: "Carré" },
] as const;
export type Format = (typeof FORMATS)[number]["id"];

// Prix xAI (par seconde générée, 720p) : voir docs.x.ai.
export const QUALITES = {
  standard: { nom: "Standard", modele: "grok-imagine-video", parSeconde: 0.07 },
  premium: {
    nom: "Haute qualité",
    modele: "grok-imagine-video-1.5",
    parSeconde: 0.08,
  },
} as const;
export type Qualite = keyof typeof QUALITES;

// Une génération fait 15 s au plus ; on prolonge ensuite par morceaux de 2 à
// 10 s. 20 s = 15 + 5 ; 30 s = 15 + 10 + 5.
export const GENERATION_MAX = 15;
export const PROLONGATION_MAX = 10;
export const PROLONGATION_MIN = 2;

export function decouper(duree: number): number[] {
  const morceaux = [Math.min(duree, GENERATION_MAX)];
  let reste = duree - morceaux[0];
  while (reste > 0) {
    const m = Math.max(PROLONGATION_MIN, Math.min(PROLONGATION_MAX, reste));
    morceaux.push(m);
    reste -= m;
  }
  return morceaux;
}

export const coutEstime = (duree: number, qualite: Qualite) =>
  Math.round(duree * QUALITES[qualite].parSeconde * 100) / 100;

export type Segment = {
  request_id: string;
  duree: number;
  genre: "generation" | "prolongation";
  statut: "en_cours" | "termine" | "echoue";
  url?: string | null;
  duree_obtenue?: number | null;
};

// Réponse de GET /v1/videos/{id}.
export function lireStatutXai(json: unknown): {
  statut: "en_cours" | "termine" | "echoue";
  progression: number;
  url: string | null;
  duree: number | null;
  erreur: string | null;
} {
  const j = (json ?? {}) as {
    status?: string;
    progress?: number;
    video?: { url?: string; duration?: number; respect_moderation?: boolean };
    error?: { message?: string } | string;
  };
  const erreur =
    typeof j.error === "string" ? j.error : (j.error?.message ?? null);
  const s = (j.status ?? "").toLowerCase();
  const url = j.video?.url ?? null;
  if (s === "done" && url)
    return {
      statut: "termine",
      progression: 100,
      url,
      duree: j.video?.duration ?? null,
      erreur: null,
    };
  if (s === "done" && j.video?.respect_moderation === false) {
    return {
      statut: "echoue",
      progression: 0,
      url: null,
      duree: null,
      erreur:
        "Vidéo refusée par la modération de xAI : changez l'image ou la consigne.",
    };
  }
  if (["failed", "expired", "error", "done"].includes(s) || erreur) {
    return {
      statut: "echoue",
      progression: 0,
      url: null,
      duree: null,
      erreur:
        erreur ??
        (s === "expired"
          ? "La génération a expiré."
          : "La génération a échoué."),
    };
  }
  return {
    statut: "en_cours",
    progression: Math.max(0, Math.min(99, Math.round(j.progress ?? 0))),
    url: null,
    duree: null,
    erreur: null,
  };
}

// Avancement global (tous morceaux confondus).
export function progressionGlobale(
  plan: number[],
  segments: Segment[],
  progressionEnCours: number,
): number {
  const total = plan.reduce((a, b) => a + b, 0);
  const faits = segments
    .filter((s) => s.statut === "termine")
    .reduce((a, s) => a + s.duree, 0);
  const courant = segments.find((s) => s.statut === "en_cours");
  const partiel = courant ? (courant.duree * progressionEnCours) / 100 : 0;
  return Math.min(99, Math.round(((faits + partiel) / total) * 100));
}

// La dernière prolongation renvoie-t-elle déjà toute la vidéo (sinon on
// recolle les morceaux) ?
export function videoComplete(segments: Segment[], duree: number): boolean {
  const dernier = segments[segments.length - 1];
  return segments.length === 1 || (dernier?.duree_obtenue ?? 0) >= duree - 1.5;
}

// Consigne de prolongation : on garde la scène et on demande une suite fluide.
export const consigneSuite = (prompt: string) =>
  `${prompt.trim()}\n\nContinue la même scène de façon fluide, mêmes personnages, même style, sans coupure.`;
