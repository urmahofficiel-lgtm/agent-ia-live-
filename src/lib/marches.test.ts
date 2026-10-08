import { describe, expect, it } from "vitest";
import {
  MARCHES,
  estEtranger,
  decorMarche,
  lireCanaux,
  marcheDe,
  reglesMarche,
  systemeMarche,
  tonVoix,
} from "./marches";

describe("marchés (langue + pays)", () => {
  it("France par défaut, marché inconnu ramené à la France", () => {
    expect(marcheDe(null).id).toBe("fr-FR");
    expect(marcheDe("xx-XX").id).toBe("fr-FR");
    expect(marcheDe("it-IT").pays).toBe("Italie");
    expect(estEtranger("fr-FR")).toBe(false);
    expect(estEtranger("de-DE")).toBe(true);
    expect(new Set(MARCHES.map((m) => m.id)).size).toBe(MARCHES.length);
  });

  it("aucune consigne de langue en France", () => {
    expect(reglesMarche("fr-FR")).toBe("");
    expect(systemeMarche(null)).toBeUndefined();
    expect(tonVoix("fr-FR", false)).toContain("française");
  });

  it("consignes dans la langue du marché, sans loi française", () => {
    const r = reglesMarche("it-IT");
    expect(r).toContain("en italien");
    expect(r).toContain("Factur-X");
    expect(r).toContain("Hashtags en italien");
    expect(systemeMarche("es-ES")).toContain("espagnol");
    expect(tonVoix("de-DE", true)).toContain("en allemand");
  });

  it("lit les canaux du pilote sans doublon", () => {
    expect(
      lireCanaux([
        { plateforme: "facebook", marche: "it-IT" },
        { plateforme: "facebook", marche: "it-IT" },
        { plateforme: "facebook" },
        { plateforme: "" },
        "x",
      ]),
    ).toEqual([
      { plateforme: "facebook", marche: "it-IT" },
      { plateforme: "facebook", marche: "fr-FR" },
    ]);
    expect(lireCanaux(null)).toEqual([]);
  });

  it("décor d'image du pays visé, rien pour la France", () => {
    expect(decorMarche("fr-FR")).toBe("");
    expect(decorMarche("it-IT")).toContain("look like Italy");
    expect(decorMarche("it-IT")).toContain("nothing specifically French");
  });
});
