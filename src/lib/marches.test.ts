import { describe, expect, it } from "vitest";
import {
  MARCHES,
  estEtranger,
  choisirCompte,
  decorMarche,
  langueDuJour,
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
      { plateforme: "facebook", marche: "it-IT", en_plus: [] },
      { plateforme: "facebook", marche: "fr-FR", en_plus: [] },
    ]);
    expect(lireCanaux(null)).toEqual([]);
  });

  it("décor d'image du pays visé, rien pour la France", () => {
    expect(decorMarche("fr-FR")).toBe("");
    expect(decorMarche("it-IT")).toContain("look like Italy");
    expect(decorMarche("it-IT")).toContain("nothing specifically French");
  });

  it("autres langues d'un compte : une par jour, à tour de rôle", () => {
    const enPlus = ["it-IT", "es-ES", "de-DE"];
    const jours = ["2026-10-01", "2026-10-02", "2026-10-03"].map((j) =>
      langueDuJour(enPlus, j),
    );
    expect(new Set(jours)).toEqual(new Set(enPlus));
    expect(langueDuJour(enPlus, "2026-10-04")).toBe(jours[0]);
    expect(langueDuJour(["it-IT"], "2026-10-01", ["it-IT"])).toBeNull();
    expect(langueDuJour([], "2026-10-01")).toBeNull();
  });

  it("choisit la page du pays, sinon le compte qui publie aussi dans la langue", () => {
    const fr = {
      id: "fr",
      marche: "fr-FR",
      langues_en_plus: ["it-IT", "es-ES"],
    };
    const it = { id: "it", marche: "it-IT", langues_en_plus: [] };
    expect(choisirCompte([fr, it], "it-IT")?.id).toBe("it");
    expect(choisirCompte([fr], "es-ES")?.id).toBe("fr");
    expect(choisirCompte([fr], null)?.id).toBe("fr");
    expect(choisirCompte([fr], "de-DE")).toBeNull();
  });

  it("canaux : langues en plus lues et fusionnées", () => {
    expect(
      lireCanaux([
        { plateforme: "facebook", marche: "fr-FR", en_plus: ["it-IT", "xx"] },
        {
          plateforme: "facebook",
          marche: "fr-FR",
          en_plus: ["es-ES", "fr-FR"],
        },
      ]),
    ).toEqual([
      { plateforme: "facebook", marche: "fr-FR", en_plus: ["it-IT", "es-ES"] },
    ]);
  });
});
