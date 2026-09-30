import { nomPlateforme } from "./plateformes";
import { lireStyleImage, lireStyleVideo, nomStyleImage, nomStyleVideo } from "./styles";

// Statistiques des publications et « apprentissage » : ce qui marche auprès de
// l'audience. Partie sans réseau, partagée par le moteur et l'interface.

export type Stats = {
  vues: number | null;
  likes: number | null;
  commentaires: number | null;
  partages: number | null;
  maj: string;
  erreur?: string | null;
};

export type PubliStat = {
  id?: string;
  titre: string;
  plateforme: string | null;
  publie_le: string | null;
  video: boolean;
  video_style?: string | null;
  visuel_style?: string | null;
  stats: Partial<Stats> | null;
};

export type Apprentissage = {
  resume: string;
  top: { titre: string; reseau: string; score: number; vues: number | null; likes: number | null; commentaires: number | null; partages: number | null; publie_le: string | null }[];
  nb_publications: number;
  maj: string;
};

export const JOURS_STATS = 30;
const FUSEAU = "Europe/Paris";

// --- Lecture des réponses des API ----------------------------------------------

const nombre = (x: unknown): number | null => {
  const n = typeof x === "string" && x.trim() !== "" ? Number(x) : x;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

type Resume = { summary?: { total_count?: number } };

// Post, photo ou vidéo Facebook : réactions (ou likes), commentaires, partages.
export function lireStatsFacebook(json: { reactions?: Resume; likes?: Resume; comments?: Resume; shares?: { count?: number } } | null) {
  return {
    likes: nombre(json?.reactions?.summary?.total_count ?? json?.likes?.summary?.total_count),
    commentaires: nombre(json?.comments?.summary?.total_count),
    partages: json?.shares ? (nombre(json.shares.count) ?? 0) : null,
  };
}

type Insight = { name?: string; values?: { value?: unknown }[]; total_value?: { value?: unknown } };

// Réponse « insights » (Facebook video_insights ou Instagram) : métrique → valeur.
export function lireInsights(json: { data?: Insight[] } | null): Record<string, number> {
  const r: Record<string, number> = {};
  for (const m of json?.data ?? []) {
    const v = nombre(m.total_value?.value ?? m.values?.[0]?.value);
    if (m.name && v !== null) r[m.name] = v;
  }
  return r;
}

// Média Instagram (like_count, comments_count) + insights facultatifs.
export function lireStatsInstagram(media: { like_count?: number; comments_count?: number } | null, insights: Record<string, number> = {}) {
  return {
    vues: insights.views ?? insights.plays ?? insights.reach ?? null,
    likes: nombre(media?.like_count),
    commentaires: nombre(media?.comments_count),
    partages: insights.shares ?? null,
  };
}

type AnalyticsZernio = { views?: number; impressions?: number; likes?: number; comments?: number; shares?: number };

// GET /v1/analytics?postId=… de Zernio (post unique).
export function lireStatsZernio(json: { analytics?: AnalyticsZernio; platformAnalytics?: { analytics?: AnalyticsZernio }[] } | null) {
  const a = json?.analytics ?? json?.platformAnalytics?.[0]?.analytics;
  if (!a) return null;
  const vues = nombre(a.views);
  return {
    // Vues quand le réseau les donne (vidéo), sinon impressions.
    vues: vues || nombre(a.impressions) || vues,
    likes: nombre(a.likes),
    commentaires: nombre(a.comments),
    partages: nombre(a.shares),
  };
}

// Canal de lecture des stats d'un post : Zernio (identifiant de 24
// caractères hexadécimaux), Meta direct (Facebook / Instagram) ou aucun.
export type Source = "zernio" | "facebook" | "instagram_meta" | "instagram_direct" | null;

export function sourceStats(plateforme: string | null, postId: string, fournisseur: string | null): Source {
  if (/^[a-f0-9]{24}$/.test(postId)) return "zernio";
  if (!/^\d+(_\d+)?$/.test(postId)) return null;
  if (plateforme === "facebook" && fournisseur === "meta") return "facebook";
  if (plateforme === "instagram" && fournisseur === "meta") return "instagram_meta";
  if (plateforme === "instagram" && fournisseur === "instagram") return "instagram_direct";
  return null;
}

// --- Agrégation ----------------------------------------------------------------

// Score d'engagement : un commentaire ou un partage vaut plus qu'un like ;
// les vues départagent.
export function score(s: Partial<Stats> | null | undefined) {
  if (!s) return 0;
  return (s.likes ?? 0) + 2 * (s.commentaires ?? 0) + 3 * (s.partages ?? 0) + (s.vues ?? 0) / 100;
}

export const aDesStats = (p: PubliStat) =>
  Boolean(p.stats && [p.stats.vues, p.stats.likes, p.stats.commentaires, p.stats.partages].some((v) => typeof v === "number"));

// Totaux par réseau ; null si le réseau ne fournit pas la métrique.
export type Totaux = { reseau: string; publications: number; vues: number | null; likes: number | null; commentaires: number | null; partages: number | null };

const METRIQUES = ["vues", "likes", "commentaires", "partages"] as const;

export function totauxParReseau(pubs: PubliStat[]): Totaux[] {
  const m = new Map<string, Totaux>();
  for (const p of pubs) {
    const r = p.plateforme ?? "autre";
    const t = m.get(r) ?? { reseau: r, publications: 0, vues: null, likes: null, commentaires: null, partages: null };
    t.publications++;
    for (const k of METRIQUES) {
      const v = p.stats?.[k];
      if (typeof v === "number") t[k] = (t[k] ?? 0) + v;
    }
    m.set(r, t);
  }
  return [...m.values()].sort((a, b) => b.publications - a.publications);
}

export const CRENEAUX = [
  { id: "nuit", nom: "Nuit (0 h – 7 h)", de: 0, a: 7 },
  { id: "matin", nom: "Matin (7 h – 11 h)", de: 7, a: 11 },
  { id: "midi", nom: "Midi (11 h – 14 h)", de: 11, a: 14 },
  { id: "apres_midi", nom: "Après-midi (14 h – 18 h)", de: 14, a: 18 },
  { id: "soir", nom: "Soir (18 h – 22 h)", de: 18, a: 22 },
  { id: "tard", nom: "Tard (22 h – 24 h)", de: 22, a: 24 },
] as const;

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

// Heure et jour à Paris (les clients sont en France).
export function momentParis(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parties = new Intl.DateTimeFormat("en-GB", { timeZone: FUSEAU, hour: "numeric", hourCycle: "h23", weekday: "short" }).formatToParts(d);
  const heure = Number(parties.find((p) => p.type === "hour")?.value ?? 0);
  const jour = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parties.find((p) => p.type === "weekday")?.value ?? "");
  return { heure, jour: JOURS[jour] ?? "" };
}

export const creneau = (heure: number) => CRENEAUX.find((c) => heure >= c.de && heure < c.a) ?? CRENEAUX[0];

export type Groupe = { cle: string; nom: string; n: number; moyenne: number };

// Moyenne du score par groupe (réseau, créneau, style…), meilleur d'abord.
export function moyennes(pubs: PubliStat[], cle: (p: PubliStat) => { cle: string; nom: string } | null): Groupe[] {
  const m = new Map<string, Groupe & { total: number }>();
  for (const p of pubs) {
    const k = cle(p);
    if (!k) continue;
    const g = m.get(k.cle) ?? { ...k, n: 0, moyenne: 0, total: 0 };
    g.n++;
    g.total += score(p.stats);
    m.set(k.cle, g);
  }
  return [...m.values()]
    .map(({ total, ...g }) => ({ ...g, moyenne: Math.round((total / g.n) * 10) / 10 }))
    .sort((a, b) => b.moyenne - a.moyenne || b.n - a.n);
}

export const parReseau = (pubs: PubliStat[]) => moyennes(pubs, (p) => (p.plateforme ? { cle: p.plateforme, nom: nomPlateforme(p.plateforme) } : null));

export const parCreneau = (pubs: PubliStat[]) =>
  moyennes(pubs, (p) => {
    const m = p.publie_le ? momentParis(p.publie_le) : null;
    if (!m) return null;
    const c = creneau(m.heure);
    return { cle: c.id, nom: c.nom };
  });

export const parJour = (pubs: PubliStat[]) =>
  moyennes(pubs, (p) => {
    const m = p.publie_le ? momentParis(p.publie_le) : null;
    return m?.jour ? { cle: m.jour, nom: m.jour } : null;
  });

export const parFormat = (pubs: PubliStat[]) =>
  moyennes(pubs, (p) => (p.video ? { cle: "video", nom: "Vidéo" } : { cle: "image", nom: "Image / texte" }));

export const parStyleVideo = (pubs: PubliStat[]) =>
  moyennes(pubs, (p) => {
    if (!p.video || !p.video_style) return null;
    const s = lireStyleVideo(p.video_style);
    return { cle: s, nom: nomStyleVideo(s) };
  });

export const parStyleImage = (pubs: PubliStat[]) =>
  moyennes(pubs, (p) => {
    if (p.video || !p.visuel_style) return null;
    const s = lireStyleImage(p.visuel_style);
    return { cle: s, nom: nomStyleImage(s) };
  });

export const classer = (pubs: PubliStat[]) => [...pubs].sort((a, b) => score(b.stats) - score(a.stats));

const arrondi = (x: number) => (x >= 10 ? Math.round(x) : Math.round(x * 10) / 10);
const guillemets = (t: string) => `« ${t.trim().slice(0, 80)} »`;

// Compare le meilleur groupe au suivant : puce seulement s'il y a au moins deux
// groupes et un écart net.
function comparer(groupes: Groupe[], phrase: (g: Groupe, ratio: string) => string) {
  if (groupes.length < 2 || groupes[0].moyenne <= 0) return null;
  const [a, b] = groupes;
  const ratio = b.moyenne > 0 ? a.moyenne / b.moyenne : Infinity;
  if (ratio < 1.15) return null;
  return phrase(a, ratio === Infinity ? "nettement plus" : `${arrondi(ratio)} fois plus`);
}

// Résumé de ce qui marche, par utilisateur : 5 à 8 puces courtes, lisibles
// par une IA qui choisit les prochains sujets. null sans aucune stat.
export function calculerApprentissage(toutes: PubliStat[], maintenant = new Date()): Apprentissage | null {
  const pubs = toutes.filter(aDesStats);
  if (!pubs.length) return null;
  const classees = classer(pubs);
  const puces: string[] = [];

  const top = classees.slice(0, 3).filter((p) => score(p.stats) > 0);
  if (top.length) {
    puces.push(
      `Sujets qui marchent le mieux : ${top.map((p) => `${guillemets(p.titre)} (${nomPlateforme(p.plateforme)})`).join(", ")} — proposer des sujets proches ou des suites.`,
    );
  }

  const reseaux = parReseau(pubs);
  if (reseaux.length >= 2 && reseaux[0].moyenne > 0) {
    puces.push(`Réseau le plus réactif : ${reseaux[0].nom} (${reseaux[0].n} publication${reseaux[0].n > 1 ? "s" : ""}) ; le moins réactif : ${reseaux[reseaux.length - 1].nom}.`);
  } else if (reseaux.length === 1) {
    puces.push(`Toutes les données viennent de ${reseaux[0].nom} : tester d'autres réseaux pour comparer.`);
  }

  const format = comparer(parFormat(pubs), (g, r) => `Format : ${g.cle === "video" ? "les vidéos (Reels)" : "les images"} obtiennent ${r} d'engagement — à privilégier.`);
  if (format) puces.push(format);

  const sv = parStyleVideo(pubs);
  if (sv.length && sv[0].moyenne > 0) puces.push(`Style de vidéo le plus efficace : ${sv[0].nom}${sv.length > 1 ? ` (devant ${sv[sv.length - 1].nom})` : ""}.`);
  const si = parStyleImage(pubs);
  if (si.length && si[0].moyenne > 0) puces.push(`Style d'image le plus efficace : ${si[0].nom}${si.length > 1 ? ` (devant ${si[si.length - 1].nom})` : ""}.`);

  const creneaux = parCreneau(pubs);
  if (creneaux.length && creneaux[0].moyenne > 0) {
    const jours = parJour(pubs);
    puces.push(`Meilleur moment pour publier : ${creneaux[0].nom.toLowerCase()}${jours.length >= 2 && jours[0].moyenne > 0 ? `, surtout le ${jours[0].nom}` : ""} (heure de Paris).`);
  }

  const flops = classees.slice(-2).reverse().filter((p) => !top.includes(p));
  if (pubs.length >= 5 && flops.length) {
    puces.push(`Moins de réactions : ${flops.map((p) => guillemets(p.titre)).join(", ")} — éviter de répéter ces angles tels quels.`);
  }

  const commentee = [...pubs].sort((a, b) => (b.stats?.commentaires ?? 0) - (a.stats?.commentaires ?? 0))[0];
  if ((commentee.stats?.commentaires ?? 0) >= 2) {
    puces.push(`Publication la plus commentée : ${guillemets(commentee.titre)} (${commentee.stats?.commentaires} commentaires) — reprendre ce qui fait réagir.`);
  }

  puces.push(
    pubs.length < 5
      ? `Base encore mince (${pubs.length} publication${pubs.length > 1 ? "s" : ""} mesurée${pubs.length > 1 ? "s" : ""} sur ${JOURS_STATS} jours) : tendances indicatives, continuer à varier sujets et formats.`
      : `Base : ${pubs.length} publications mesurées sur ${JOURS_STATS} jours.`,
  );

  return {
    resume: puces.slice(0, 8).map((p) => `- ${p}`).join("\n"),
    top: classees.slice(0, 5).map((p) => ({
      titre: p.titre,
      reseau: p.plateforme ?? "",
      score: arrondi(score(p.stats)),
      vues: p.stats?.vues ?? null,
      likes: p.stats?.likes ?? null,
      commentaires: p.stats?.commentaires ?? null,
      partages: p.stats?.partages ?? null,
      publie_le: p.publie_le,
    })),
    nb_publications: pubs.length,
    maj: maintenant.toISOString(),
  };
}
