import { describe, expect, it } from "vitest";
import { hashtagsPropres, lireTendances, nettoyerHashtags, requetesTendances } from "./tendances";

describe("hashtags", () => {
  it("retire les hashtags inventés, en double ou datés", () => {
    expect(hashtagsPropres(["#BTP", "#BTP2026", "#DigitalBTP", "#Artisan", "#artisan", "renovation", "#ConstructionTech", "#Plaquiste"])).toEqual(["#BTP", "#Artisan", "#renovation", "#Plaquiste"]);
  });

  it("limite le nombre selon le réseau et les regroupe à la fin", () => {
    const t = "Marre des devis le soir ? #BTP #DevisIA\nEssai gratuit, lien en bio. #Artisan #Chantier #Renovation #Peintre #Plombier #BTP2026";
    expect(nettoyerHashtags(t, "facebook")).toBe("Marre des devis le soir ?\nEssai gratuit, lien en bio.\n\n#BTP #Artisan");
    expect(nettoyerHashtags(t, "instagram").split("\n").at(-1)).toBe("#BTP #Artisan #Chantier #Renovation #Peintre");
  });

  it("laisse un texte sans hashtag tel quel", () => {
    expect(nettoyerHashtags("Un texte simple.", "tiktok")).toBe("Un texte simple.");
  });
});

describe("tendances", () => {
  it("cherche l'actualité du domaine de la marque", () => {
    const r = requetesTendances("Marque : BTP Ecosystem\nActivité : logiciel pour artisans du bâtiment", "2026-10-20");
    expect(r.length).toBeGreaterThanOrEqual(3);
    expect(r[0]).toContain("octobre 2026");
  });

  it("résume la réponse de l'IA, sources et hashtags propres", () => {
    const t = lireTendances(
      JSON.stringify({
        sujets: [{ titre: "Hausse du prix des matériaux", angle: "chiffrer juste dès la visite", source: 1 }],
        mots: ["métré", "réserves"],
        hashtags: ["#Artisan", "#BTP2026", "#Renovation"],
      }),
      [{ url: "https://exemple.fr/article" }],
    );
    expect(t?.resume).toContain("Hausse du prix des matériaux → angle : chiffrer juste dès la visite (source : https://exemple.fr/article)");
    expect(t?.resume).toContain("Mots de la cible : métré, réserves");
    expect(t?.hashtags).toEqual(["#Artisan", "#Renovation"]);
  });

  it("refuse une réponse illisible", () => {
    expect(lireTendances("rien")).toBeNull();
    expect(lireTendances(JSON.stringify({ sujets: [] }))).toBeNull();
  });
});
