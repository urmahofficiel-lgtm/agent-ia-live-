import { describe, expect, it } from "vitest";
import { reglesReseau, sansHashtagsSiGroupe, sansLienSiReseau } from "./texte";
import { estPilotable, planDuJour } from "./pilote";

// Groupes Facebook : un post par jour, partagé par l'utilisateur lui-même.
describe("groupes Facebook", () => {
  it("consigne : à la première personne, sans lien ni hashtag", () => {
    const r = reglesReseau("facebook_groupe");
    expect(r).toContain("première personne");
    expect(r).toContain("AUCUN lien, AUCUN hashtag");
    expect(r).toContain("N'invente AUCUNE expérience personnelle");
  });

  it("retire les hashtags et les liens du post", () => {
    const post =
      "Combien de temps pour un devis ?\nJe teste un outil : https://btp-ecosystem.com\n#BTP #Artisan";
    const propre = sansHashtagsSiGroupe(
      sansLienSiReseau(post, "facebook_groupe"),
      "facebook_groupe",
    );
    expect(propre).not.toMatch(/#|https?:/);
    expect(propre).toContain("Combien de temps pour un devis ?");
    expect(sansHashtagsSiGroupe("#BTP", "facebook")).toBe("#BTP");
  });

  it("le pilote planifie les groupes, pas le profil perso", () => {
    expect(estPilotable("facebook_groupe")).toBe(true);
    expect(estPilotable("facebook_profil")).toBe(false);
    const p = planDuJour(
      [{ plateforme: "facebook_groupe", marche: "fr-FR" }],
      { facebook_groupe: 1 },
      ["08:30", "12:30", "18:30"],
      "2026-10-12",
      new Date("2026-10-12T03:10:00Z"),
    );
    expect(p.creneaux.map((c) => c.plateforme)).toEqual(["facebook_groupe"]);
  });
});
