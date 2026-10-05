import { describe, expect, it } from "vitest";
import { avecVeille, VEILLE_BTP } from "./veille";

describe("veille BTP Ecosystem", () => {
  it("s'ajoute au contexte de BTP Ecosystem, une seule fois", () => {
    const c = avecVeille("Marque : BTP Ecosystem\nActivité : logiciel BTP");
    expect(c).toContain(VEILLE_BTP);
    expect(avecVeille(c)).toBe(c);
  });
  it("ne touche ni aux autres marques ni à l'absence de contexte", () => {
    expect(avecVeille("Marque : Boulangerie Martin")).toBe("Marque : Boulangerie Martin");
    expect(avecVeille(null)).toBeNull();
  });
  it("interdit les promesses de conformité et les faux avis", () => {
    expect(VEILLE_BTP).toMatch(/JAMAIS « 100 % conforme/);
    expect(VEILLE_BTP).toMatch(/PAS d'avis clients/);
    expect(VEILLE_BTP).toMatch(/en paiement annuel/);
  });
});
