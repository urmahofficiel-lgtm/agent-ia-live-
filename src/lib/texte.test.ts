import { describe, expect, it } from "vitest";
import { nettoyerPost, reglesReseau, sansLienSiReseau } from "./texte";

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

describe("liens selon le réseau", () => {
  it("retire les liens sur Facebook, LinkedIn, TikTok et Instagram", () => {
    const t = "Vous perdez des heures sur vos devis ?\n\nEssayez gratuitement : https://www.btp-ecosystem.com/essai\n👉 www.btp-ecosystem.com\n\n#BTP #Artisan";
    const f = sansLienSiReseau(t, "facebook");
    expect(f).not.toMatch(/https?:|www\.|btp-ecosystem\.com/);
    expect(f).toContain("Essayez gratuitement");
    expect(f).toContain("#BTP #Artisan");
    expect(sansLienSiReseau("Voir btp-ecosystem.com", "linkedin")).toBe("Voir");
  });
  it("garde le lien sur les autres réseaux", () => {
    expect(sansLienSiReseau("Site : https://exemple.fr", "bluesky")).toBe("Site : https://exemple.fr");
    expect(sansLienSiReseau("Site : https://exemple.fr", null)).toBe("Site : https://exemple.fr");
  });
  it("donne une consigne propre à chaque réseau", () => {
    expect(reglesReseau("facebook")).toContain("AUCUN lien");
    expect(reglesReseau("tiktok")).toContain("lien en bio");
    expect(reglesReseau("bluesky")).toContain("lien du site");
  });
});
