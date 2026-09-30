import { describe, expect, it } from "vitest";
import {
  calculerApprentissage,
  creneau,
  lireInsights,
  lireStatsFacebook,
  lireStatsInstagram,
  lireStatsZernio,
  momentParis,
  parCreneau,
  sourceStats,
  totauxParReseau,
  type PubliStat,
} from "./statistiques";

const pub = (titre: string, plateforme: string, likes: number, extra: Partial<PubliStat> = {}): PubliStat => ({
  titre,
  plateforme,
  publie_le: "2026-09-15T16:30:00Z", // 18 h 30 à Paris
  video: false,
  stats: { vues: null, likes, commentaires: 0, partages: null, maj: "2026-09-20T00:00:00Z" },
  ...extra,
});

describe("lecture des réponses des API", () => {
  it("Facebook : réactions, commentaires, partages", () => {
    expect(
      lireStatsFacebook({ reactions: { summary: { total_count: 12 } }, comments: { summary: { total_count: 3 } }, shares: { count: 2 } }),
    ).toEqual({ likes: 12, commentaires: 3, partages: 2 });
  });

  it("Facebook : pas de champ shares → null ; shares vide → 0 ; likes en secours", () => {
    expect(lireStatsFacebook({ likes: { summary: { total_count: 4 } } })).toEqual({ likes: 4, commentaires: null, partages: null });
    expect(lireStatsFacebook({ shares: {} }).partages).toBe(0);
    expect(lireStatsFacebook(null)).toEqual({ likes: null, commentaires: null, partages: null });
  });

  it("insights : values[0] ou total_value", () => {
    expect(
      lireInsights({ data: [{ name: "blue_reels_play_count", values: [{ value: 340 }] }, { name: "views", total_value: { value: 90 } }, { name: "x", values: [] }] }),
    ).toEqual({ blue_reels_play_count: 340, views: 90 });
    expect(lireInsights(null)).toEqual({});
  });

  it("Instagram : compteurs du média et insights facultatifs", () => {
    expect(lireStatsInstagram({ like_count: 8, comments_count: 1 })).toEqual({ vues: null, likes: 8, commentaires: 1, partages: null });
    expect(lireStatsInstagram({ like_count: 8 }, { views: 500, shares: 4 })).toMatchObject({ vues: 500, partages: 4 });
  });

  it("Zernio : analytics du post, impressions si pas de vues", () => {
    expect(lireStatsZernio({ analytics: { views: 0, impressions: 210, likes: 5, comments: 2, shares: 1 } })).toEqual({
      vues: 210,
      likes: 5,
      commentaires: 2,
      partages: 1,
    });
    expect(lireStatsZernio({ platformAnalytics: [{ analytics: { views: 30, likes: 1 } }] })).toMatchObject({ vues: 30, likes: 1 });
    expect(lireStatsZernio({})).toBeNull();
  });

  it("choisit le bon canal selon l'identifiant et la connexion", () => {
    expect(sourceStats("linkedin", "66f0c2a1b2c3d4e5f6a7b8c9", "zernio")).toBe("zernio");
    expect(sourceStats("facebook", "123_456", "meta")).toBe("facebook");
    expect(sourceStats("facebook", "123456", "meta")).toBe("facebook");
    expect(sourceStats("instagram", "179", "meta")).toBe("instagram_meta");
    expect(sourceStats("instagram", "179", "instagram")).toBe("instagram_direct");
    expect(sourceStats("linkedin", "urn:li:share:1", "linkedin")).toBeNull();
    expect(sourceStats("facebook", "123", null)).toBeNull();
  });
});

describe("agrégation", () => {
  it("heure de Paris et créneaux", () => {
    expect(momentParis("2026-09-15T16:30:00Z")).toEqual({ heure: 18, jour: "mardi" });
    expect(momentParis("2026-01-15T07:00:00Z")?.heure).toBe(8); // heure d'hiver
    expect(creneau(12).id).toBe("midi");
    expect(momentParis("n'importe quoi")).toBeNull();
  });

  it("totaux par réseau (null si la métrique n'est jamais fournie)", () => {
    const t = totauxParReseau([pub("A", "facebook", 3), pub("B", "facebook", 2), pub("C", "instagram", 7), { ...pub("D", "linkedin", 0), stats: null }]);
    expect(t[0]).toMatchObject({ reseau: "facebook", publications: 2, likes: 5, commentaires: 0, partages: null, vues: null });
    expect(t.find((x) => x.reseau === "linkedin")).toMatchObject({ publications: 1, likes: null });
  });

  it("moyennes par créneau, meilleur d'abord", () => {
    const g = parCreneau([pub("Soir", "facebook", 10), pub("Matin", "facebook", 1, { publie_le: "2026-09-15T06:00:00Z" })]);
    expect(g.map((x) => x.cle)).toEqual(["soir", "matin"]);
  });
});

describe("apprentissage", () => {
  it("null sans aucune statistique", () => {
    expect(calculerApprentissage([])).toBeNull();
    expect(calculerApprentissage([{ ...pub("A", "facebook", 0), stats: { maj: "x", erreur: "compte déconnecté" } }])).toBeNull();
  });

  it("résumé en 5 à 8 puces avec sujets, réseau, format, style et créneau", () => {
    const pubs = [
      pub("Avant / après salle de bain", "instagram", 60, { video: true, video_style: "avant_apres" }),
      pub("3 erreurs de rénovation", "instagram", 45, { video: true, video_style: "top3" }),
      pub("Chantier de la semaine", "facebook", 12, { visuel_style: "accroche" }),
      pub("Promo d'automne", "facebook", 2, { visuel_style: "promo" }),
      pub("Nos horaires", "facebook", 1, { visuel_style: "photo", publie_le: "2026-09-16T05:00:00Z" }),
      { ...pub("Conseil entretien", "linkedin", 5), stats: { vues: 800, likes: 5, commentaires: 3, partages: 1, maj: "x" } },
    ];
    const a = calculerApprentissage(pubs, new Date("2026-09-30T10:00:00Z"))!;
    const puces = a.resume.split("\n");
    expect(puces.length).toBeGreaterThanOrEqual(5);
    expect(puces.length).toBeLessThanOrEqual(8);
    expect(puces.every((p) => p.startsWith("- "))).toBe(true);
    expect(a.resume).toContain("« Avant / après salle de bain »");
    expect(a.resume).toContain("Réseau le plus réactif : Instagram");
    expect(a.resume).toContain("les vidéos (Reels)");
    expect(a.resume).toContain("Style de vidéo le plus efficace : Avant / après");
    expect(a.resume).toContain("Style d'image le plus efficace : Accroche");
    expect(a.resume).toContain("soir");
    expect(a.resume).toContain("« Nos horaires »");
    expect(a.top).toHaveLength(5);
    expect(a.top[0]).toMatchObject({ titre: "Avant / après salle de bain", reseau: "instagram", likes: 60 });
    expect(a.nb_publications).toBe(6);
    expect(a.maj).toBe("2026-09-30T10:00:00.000Z");
  });

  it("peu de données : le résumé le signale", () => {
    const a = calculerApprentissage([pub("Seul post", "facebook", 3)])!;
    expect(a.resume).toContain("Base encore mince (1 publication mesurée");
    expect(a.resume).toContain("Toutes les données viennent de Facebook");
  });
});
