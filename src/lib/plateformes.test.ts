import { describe, expect, it } from "vitest";
import { PLATEFORMES, nomPlateforme } from "./plateformes";

describe("plateformes", () => {
  it("a des identifiants uniques", () => {
    const ids = PLATEFORMES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("couvre les réseaux demandés", () => {
    for (const id of ["facebook", "instagram", "linkedin", "tiktok", "x", "google_business", "youtube"]) {
      expect(PLATEFORMES.some((p) => p.id === id)).toBe(true);
    }
  });

  it("retombe sur l'identifiant pour une plateforme inconnue", () => {
    expect(nomPlateforme("inconnue")).toBe("inconnue");
    expect(nomPlateforme(null)).toBe("—");
  });
});
