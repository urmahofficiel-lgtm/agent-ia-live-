import { describe, expect, it } from "vitest";
import { URL_LIENS, codeValide, estRobot, lienCliquable, remplacerLiens, trouverLiens } from "./liens-suivis";

describe("liens suivis", () => {
  it("trouve les liens d'un post sans la ponctuation qui suit", () => {
    expect(trouverLiens("Essai gratuit sur https://www.btp-ecosystem.com. Et https://site.fr/tarifs?x=1, voilà")).toEqual([
      "https://www.btp-ecosystem.com",
      "https://site.fr/tarifs?x=1",
    ]);
    expect(trouverLiens("Pas de lien ici")).toEqual([]);
    expect(trouverLiens(`Déjà court : ${URL_LIENS}abc1234`)).toEqual([]);
    expect(trouverLiens("deux fois https://a.fr et https://a.fr")).toEqual(["https://a.fr"]);
  });

  it("remplace les liens par leur lien court, les plus longs d'abord", () => {
    const codes = new Map([
      ["https://site.fr", "aaaaaaa"],
      ["https://site.fr/tarifs", "bbbbbbb"],
    ]);
    expect(remplacerLiens("Voir https://site.fr/tarifs et https://site.fr !", codes)).toBe(`Voir ${URL_LIENS}bbbbbbb et ${URL_LIENS}aaaaaaa !`);
    expect(remplacerLiens("Rien", codes)).toBe("Rien");
  });

  it("ne raccourcit que là où le lien est cliquable", () => {
    expect(lienCliquable("facebook")).toBe(true);
    expect(lienCliquable("linkedin")).toBe(true);
    expect(lienCliquable("instagram")).toBe(false);
    expect(lienCliquable("tiktok")).toBe(false);
  });

  it("ne compte pas les robots d'aperçu", () => {
    expect(estRobot("facebookexternalhit/1.1")).toBe(true);
    expect(estRobot("LinkedInBot/1.0")).toBe(true);
    expect(estRobot("WhatsApp/2.23")).toBe(true);
    expect(estRobot(null)).toBe(true);
    expect(estRobot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 [FBAN/FBIOS]")).toBe(false);
  });

  it("valide le format des codes", () => {
    expect(codeValide("a1b2c3d")).toBe(true);
    expect(codeValide("A1B2C3D")).toBe(false);
    expect(codeValide("abc")).toBe(false);
  });
});
