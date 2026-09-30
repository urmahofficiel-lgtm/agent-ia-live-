import { describe, expect, it } from "vitest";
import { assombrir, couleurAccent, couleurAss, couleurTheme, normaliserHex, texteSurCouleur } from "./couleurs";

describe("couleurs", () => {
  it("normalise les codes hexadécimaux", () => {
    expect(normaliserHex("#f80")).toBe("#FF8800");
    expect(normaliserHex("ff8a3d")).toBe("#FF8A3D");
    expect(normaliserHex("rouge")).toBeNull();
  });
  it("refuse les couleurs inutilisables comme accent", () => {
    expect(couleurAccent("#FF8A3D")).toBe("#FF8A3D");
    expect(couleurAccent("#FFFFFF")).toBeNull();
    expect(couleurAccent("#000000")).toBeNull();
    expect(couleurAccent("#777777")).toBeNull();
  });
  it("convertit au format ASS (&HAABBGGRR)", () => {
    expect(couleurAss("#FF8A3D")).toBe("&H003D8AFF");
    expect(couleurAss("#000000", 0x40)).toBe("&H40000000");
  });
  it("choisit un texte lisible et assombrit", () => {
    expect(texteSurCouleur("#FFD60A")).toBe("#111111");
    expect(texteSurCouleur("#1D4ED8")).toBe("#FFFFFF");
    expect(assombrir("#FF8A3D", 0.5)).toBe("#80451F");
  });
  it("lit la couleur de thème d'un site", () => {
    expect(couleurTheme('<head><meta name="theme-color" content="#0ea5e9"></head>')).toBe("#0EA5E9");
    expect(couleurTheme('<meta name="theme-color" content="#ffffff">')).toBeNull();
    expect(couleurTheme("<p>rien</p>")).toBeNull();
  });
});
