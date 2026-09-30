import { describe, expect, it } from "vitest";
import { ajusterTexte, assVisuel, consigneTextesVisuel, couperLignes, lireTextesVisuel, textesDeSecours } from "./visuel";
import { lireStyleImage, lireStyleVideo } from "./styles";

const contexte = "Marque : BTP Ecosystem\nSite / lien à mettre dans les posts : https://btp-ecosystem.com\nAppel à l'action : Essayez gratuitement dès aujourd'hui";
const post = {
  titre: "Devis signé en 2 minutes",
  brouillon: "Vous finissez vos devis à minuit ? 😩 Avec BTP Ecosystem, dictez votre devis depuis le chantier et faites-le signer tout de suite. https://btp-ecosystem.com #BTP",
};

describe("styles", () => {
  it("replie une valeur inconnue sur le style par défaut", () => {
    expect(lireStyleVideo("ugc")).toBe("ugc");
    expect(lireStyleVideo(undefined)).toBe("classique");
    expect(lireStyleImage("promo")).toBe("promo");
    expect(lireStyleImage("n'importe quoi")).toBe("photo");
  });
});

describe("textes des images", () => {
  it("la consigne promo interdit d'inventer une remise", () => {
    expect(consigneTextesVisuel("promo", post, contexte)).toContain("N'invente AUCUN prix");
    expect(consigneTextesVisuel("citation", post, null)).toContain("n'attribue la phrase à personne");
  });
  it("lit la réponse de l'IA et retire les guillemets", () => {
    expect(lireTextesVisuel('Voici : {"titre": "« Devis en 2 min »", "sous_titre": "", "etiquette": "", "appel": ""}')?.titre).toBe("Devis en 2 min");
    expect(lireTextesVisuel('{"titre": ""}')).toBeNull();
    expect(lireTextesVisuel("désolé")).toBeNull();
  });
  it("textes de secours sans IA, sans lien ni hashtag", () => {
    const promo = textesDeSecours("promo", post, contexte);
    expect(promo.appel).toBe("Essayez gratuitement dès aujourd'hui");
    expect(promo.titre.split(" ").length).toBeLessThanOrEqual(6);
    const citation = textesDeSecours("citation", post, contexte);
    expect(citation.titre).not.toMatch(/http|#/);
    expect(textesDeSecours("accroche", post, contexte).sous_titre).toBe("BTP Ecosystem");
  });
});

describe("mise en page", () => {
  it("coupe les lignes selon la largeur", () => {
    const lignes = couperLignes("Vos devis prêts avant de quitter le chantier", 60, 500, true);
    expect(lignes.length).toBeGreaterThan(1);
    expect(lignes.join(" ")).toBe("Vos devis prêts avant de quitter le chantier");
  });
  it("réduit la taille jusqu'à tenir dans le nombre de lignes", () => {
    const long = "Un bon artisan passe ses journées sur le chantier, pas ses soirées sur la paperasse administrative";
    const r = ajusterTexte(long, 800, 3, 30, 120);
    expect(r.lignes.length).toBeLessThanOrEqual(3);
    expect(r.taille).toBeLessThan(120);
    expect(ajusterTexte("Court", 800, 3, 30, 120).taille).toBe(120);
  });
  it("produit un document ASS pour chaque style et chaque format", () => {
    const textes = { etiquette: "Nouveau", titre: "Devis signé en 2 minutes", sous_titre: "Depuis le chantier", appel: "Essayer" };
    for (const style of ["accroche", "citation", "promo"] as const) {
      for (const [l, h] of [[1024, 1024], [1344, 768], [768, 1344]]) {
        const ass = assVisuel(style, textes, l, h, "#FF8A3D", "BTP Ecosystem");
        expect(ass).toContain(`PlayResX: ${l}`);
        expect(ass.toUpperCase()).toContain("SIGNÉ");
      }
    }
    expect(assVisuel("promo", textes, 1024, 1024, "#FF8A3D")).toContain("ESSAYER");
    expect(assVisuel("citation", textes, 1024, 1024, "#FF8A3D", "BTP Ecosystem")).toContain("BTP ECOSYSTEM");
  });
});
