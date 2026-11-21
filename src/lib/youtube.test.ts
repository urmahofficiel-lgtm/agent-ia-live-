import { describe, expect, it } from "vitest";
import { titreShort } from "./youtube.server";

describe("titre des Shorts YouTube", () => {
  it("prend la 1re ligne du post et ajoute #Shorts", () => {
    expect(titreShort("La tour Eiffel devait disparaître\n\nLe reste du texte #btp")).toBe("La tour Eiffel devait disparaître #Shorts");
  });
  it("saute les lignes de hashtags et tient en 100 caractères", () => {
    const t = titreShort(`#btp #chantier\n${"a".repeat(150)}`);
    expect(t.length).toBeLessThanOrEqual(100);
    expect(t.endsWith("#Shorts")).toBe(true);
    expect(t.startsWith("a")).toBe(true);
  });
});
