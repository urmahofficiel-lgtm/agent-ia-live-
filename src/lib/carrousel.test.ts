import { describe, expect, it } from "vitest";
import { consigneCarrousel, couleurAss, couper, lireCarrousel, scriptCarrousel, titreDocument } from "./carrousel";

const diapos = (n: number) => Array.from({ length: n }, (_, i) => ({ titre: `Idée ${i + 1}`, texte: `Explication ${i + 1}` }));

describe("carrousel", () => {
  it("lit la réponse de l'IA : 5 diapositives au moins, sans lien ni markdown", () => {
    const c = lireCarrousel(
      `Voici : {"diapos": [{"titre": "**5 erreurs** de devis", "texte": "La n°3 coûte cher https://x.fr"}, ${diapos(5)
        .map((d) => JSON.stringify(d))
        .join(",")}]}`,
    );
    expect(c?.diapos).toHaveLength(6);
    expect(c?.diapos[0]).toEqual({ titre: "5 erreurs de devis", texte: "La n°3 coûte cher" });
    expect(titreDocument(c!)).toBe("5 erreurs de devis");
    expect(lireCarrousel(JSON.stringify({ diapos: diapos(3) }))).toBeNull();
    expect(lireCarrousel("rien")).toBeNull();
  });

  it("coupe les lignes sur des mots entiers", () => {
    expect(couper("Trajets, stationnement, allers-retours au dépôt", 20)).toEqual(["Trajets,", "stationnement,", "allers-retours au", "dépôt"]);
  });

  it("convertit la couleur de la marque pour les sous-titres", () => {
    expect(couleurAss("#F59E0B")).toBe("&H0B9EF5&");
    expect(couleurAss("pas une couleur")).toBe("&H0B9EF5&");
  });

  it("une diapositive par seconde, compteur et appel final", () => {
    const s = scriptCarrousel(diapos(7));
    expect(s).toContain("PlayResX: 1080");
    expect(s).toContain("1/7");
    expect(s).toContain("7/7");
    expect(s).toContain("Glisse");
    expect(s).toContain("Dialogue: 0,0:00:06.00,0:00:07.00");
  });

  it("consigne : sans publicité si le post l'est", () => {
    const c = consigneCarrousel({ titre: "Devis", consigne: "Post sans publicité", brouillon: "Texte", plateforme: "linkedin" }, null);
    expect(c).toContain("document à feuilleter");
    expect(c).toContain("Post sans publicité");
  });
});
