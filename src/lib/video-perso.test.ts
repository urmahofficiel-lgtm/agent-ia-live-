import { describe, expect, it } from "vitest";
import { TAILLE_MAX_VIDEO, cheminVideo, consigneVideoPerso, creneauxConseilles, resultatVideoPerso, verifierVideo, valeurChampDate } from "./video-perso";
import { jourParis, minutesParis } from "./pilote";

describe("vidéo apportée par l'utilisateur", () => {
  it("n'accepte que le MP4 de 50 Mo au plus", () => {
    expect(verifierVideo({ type: "video/mp4", size: 3_000_000 })).toBeNull();
    expect(verifierVideo({ type: "video/quicktime", size: 3_000_000 })).toMatch(/MP4/);
    expect(verifierVideo({ type: "video/mp4", size: TAILLE_MAX_VIDEO + 1 })).toMatch(/50 Mo/);
    expect(verifierVideo({ type: "video/mp4", size: 100 })).toMatch(/vide/);
  });

  it("range le fichier dans le dossier de l'utilisateur, sans accents ni espaces", () => {
    const chemin = cheminVideo("u-1", "Mon Devis du Soir (final).MP4", 1700);
    expect(chemin).toBe("u-1/perso-1700-mon-devis-du-soir-final.mp4");
    expect(cheminVideo("u-1", "!!!.mp4", 1)).toBe("u-1/perso-1-video.mp4");
    expect(cheminVideo("u-1", `${"a".repeat(120)}.mp4`, 1).length).toBeLessThan(80);
  });

  it("demande à l'agent la légende seulement, en gardant la consigne de l'utilisateur", () => {
    expect(consigneVideoPerso("")).toMatch(/légende/);
    expect(consigneVideoPerso("  Finir par le lien  ")).toMatch(/\nFinir par le lien$/);
  });

  it("la vidéo est prête d'emblée : l'agent n'en crée pas une autre", () => {
    expect(resultatVideoPerso("https://x/v.mp4")).toEqual({ video_url: "https://x/v.mp4", video_etat: "prete", video_perso: true });
  });
});

describe("créneaux conseillés", () => {
  it("propose les prochains soirs à 18 h 30 (Paris), tous dans le futur", () => {
    const maintenant = new Date("2026-10-16T10:00:00Z"); // 12 h à Paris
    const c = creneauxConseilles(maintenant, 4);
    expect(c).toHaveLength(4);
    expect(c[0].libelle).toBe("Ce soir, 18 h 30");
    for (const x of c) {
      expect(minutesParis(x.instant)).toBe(18 * 60 + 30);
      expect(x.instant.getTime()).toBeGreaterThan(maintenant.getTime());
    }
    expect(jourParis(c[1].instant)).toBe("2026-10-17");
    expect(c[1].libelle).toMatch(/samedi/);
  });

  it("passe au lendemain quand 18 h 30 est trop proche ou passé", () => {
    const c = creneauxConseilles(new Date("2026-10-16T16:20:00Z"), 2); // 18 h 20 à Paris
    expect(jourParis(c[0].instant)).toBe("2026-10-17");
    expect(creneauxConseilles(new Date("2026-10-16T20:00:00Z"), 1)[0].libelle).toMatch(/samedi/);
  });

  it("reste juste au changement d'heure (30 octobre → 1er novembre)", () => {
    const c = creneauxConseilles(new Date("2026-10-30T10:00:00Z"), 4);
    for (const x of c) expect(minutesParis(x.instant)).toBe(18 * 60 + 30);
    expect(c.map((x) => jourParis(x.instant))).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });

  it("donne la valeur d'un champ date-heure en heure de Paris", () => {
    expect(valeurChampDate(new Date("2026-10-17T16:30:00Z"))).toBe("2026-10-17T18:30");
  });
});
