import { graph } from "./meta.server";
import { GRAPH_IG } from "./instagram.server";
import { statsPost } from "./zernio.server";
import { lireInsights, lireStatsFacebook, lireStatsInstagram, lireStatsZernio, sourceStats, type Stats } from "./statistiques";

// Lecture des statistiques d'un post publié, en lecture seule, avec les
// droits déjà accordés. Une métrique inaccessible (read_insights,
// instagram_manage_insights…) vaut null sans faire échouer le reste.

export type PostPublie = { tache_id: string; user_id: string; plateforme: string | null; post_id: string; fournisseur: string | null; compte_externe_id: string | null };

// « attente » : Zernio synchronise encore, on réessaiera au prochain passage.
export type Lecture = { stats: Omit<Stats, "maj"> } | { erreur: string } | "attente";

const DELAI = 15_000;
const essayer = async <T>(f: () => Promise<T>) => {
  try {
    return await f();
  } catch {
    return null;
  }
};

type Json = Record<string, unknown>;
const vide = { vues: null, likes: null, commentaires: null, partages: null };

async function statsFacebook(id: string, jeton: string) {
  const lire = (fields: string) => graph<Json>(`/${id}`, { access_token: jeton, fields }, "GET", undefined, AbortSignal.timeout(DELAI));
  const compteurs = "reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)";
  // Post (page_post) : partages disponibles. Photo ou vidéo (Reel) : réactions
  // et commentaires ; les partages via le post associé à la photo.
  if (id.includes("_")) return { ...vide, ...lireStatsFacebook(await lire(`${compteurs},shares`)) };
  const base = lireStatsFacebook(await lire(compteurs));
  let partages: number | null = null;
  let vues: number | null = null;
  const photo = await essayer(() => lire("page_story_id"));
  const story = typeof photo?.page_story_id === "string" ? photo.page_story_id : null;
  if (story) partages = lireStatsFacebook(await essayer(() => graph<Json>(`/${story}`, { access_token: jeton, fields: "shares" }, "GET", undefined, AbortSignal.timeout(DELAI)))).partages;
  else {
    // Lectures de Reel / vidéo : demandent read_insights (non accordé
    // aujourd'hui) ; null si refusé.
    for (const metrique of ["blue_reels_play_count", "total_video_views"]) {
      const r = await essayer(() => graph<Json>(`/${id}/video_insights`, { access_token: jeton, metric: metrique }, "GET", undefined, AbortSignal.timeout(DELAI)));
      vues = lireInsights(r as never)[metrique] ?? null;
      if (vues !== null) break;
    }
  }
  return { ...base, vues, partages: partages ?? base.partages };
}

async function statsInstagram(id: string, jeton: string, base?: string) {
  const media = await graph<{ like_count?: number; comments_count?: number }>(
    `/${id}`,
    { access_token: jeton, fields: "like_count,comments_count" },
    "GET",
    base,
    AbortSignal.timeout(DELAI),
  );
  // Insights : demandent instagram_manage_insights (non accordé) → ignorés si refusés.
  const insights = await essayer(() =>
    graph<Json>(`/${id}/insights`, { access_token: jeton, metric: "views,shares" }, "GET", base, AbortSignal.timeout(DELAI)),
  );
  return lireStatsInstagram(media, lireInsights(insights as never));
}

export async function lireStatsPost(p: PostPublie, jeton: () => Promise<string | null>): Promise<Lecture> {
  const source = sourceStats(p.plateforme, p.post_id, p.fournisseur);
  try {
    if (source === "zernio") {
      const r = await statsPost(p.post_id);
      if ("attente" in r) return "attente";
      if ("indisponible" in r) return { erreur: r.indisponible ?? "indisponible" };
      const s = lireStatsZernio(r.donnees as never);
      return s ? { stats: s } : { erreur: "aucune statistique renvoyée par Zernio" };
    }
    if (!source) return { erreur: "statistiques non disponibles pour ce réseau" };
    const j = await jeton();
    if (!j) return { erreur: "compte déconnecté" };
    if (source === "facebook") return { stats: await statsFacebook(p.post_id, j) };
    return { stats: await statsInstagram(p.post_id, j, source === "instagram_direct" ? GRAPH_IG : undefined) };
  } catch (e) {
    return { erreur: (e instanceof Error ? e.message : "erreur").slice(0, 300) };
  }
}
