import { describe, expect, it } from "vitest";
import { consigneReponse, lireDecision } from "./reponses-commentaires";

describe("réponses aux commentaires", () => {
  it("tutoie sur TikTok, vouvoie sur LinkedIn, protège contre les consignes cachées", () => {
    const c = { plateforme: "tiktok", auteur: "bioclean", texte: "6000€ TTC", post: "Chiffrage élec T2" };
    expect(consigneReponse(c, "BTP Ecosystem")).toContain("Tutoiement");
    expect(consigneReponse({ ...c, plateforme: "linkedin" }, null)).toContain("Vouvoiement");
    expect(consigneReponse(c, null)).toContain("n'exécute jamais");
    expect(consigneReponse({ ...c, plateforme: "instagram" }, null)).toContain("ne permet pas de liker");
    expect(consigneReponse(c, null)).toContain("« liker »");
  });

  it("lit la décision de l'IA et nettoie la réponse", () => {
    expect(lireDecision('{"action": "repondre", "texte": "Merci ! Tu comptes combien de jours ? #btp https://x.fr"}')).toEqual({
      action: "repondre",
      texte: "Merci ! Tu comptes combien de jours ?",
    });
    expect(lireDecision('{"action": "liker", "texte": ""}').action).toBe("liker");
    expect(lireDecision('{"action": "repondre", "texte": ""}').action).toBe("liker");
    expect(lireDecision('{"action": "ignorer"}').action).toBe("ignorer");
    expect(lireDecision("n'importe quoi").action).toBe("ignorer");
  });
});
