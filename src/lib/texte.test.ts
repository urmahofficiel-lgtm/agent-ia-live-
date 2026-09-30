import { describe, expect, it } from "vitest";
import { nettoyerPost } from "./texte";

describe("nettoyerPost", () => {
  it("retire le markdown mais garde les hashtags", () => {
    expect(nettoyerPost("**Essai gratuit** : <https://exemple.fr>\n\n#BTP #Artisan")).toBe("Essai gratuit : https://exemple.fr\n\n#BTP #Artisan");
  });
  it("retire le titre interne recopié en tête", () => {
    expect(nettoyerPost("**Campagne J1 – Devis à la voix**\n\nDictez vos devis.", "Campagne J1 – Devis à la voix")).toBe("Dictez vos devis.");
  });
  it("garde une première ligne différente du titre", () => {
    expect(nettoyerPost("Encore un devis ce soir ?\nSuite", "Campagne J1")).toBe("Encore un devis ce soir ?\nSuite");
  });
});
