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

  it("LinkedIn : suit le tutoiement du post et renvoie vers le premier commentaire", () => {
    const c = { plateforme: "linkedin", auteur: "Marc", texte: "GUIDE", post: "Tu perds des heures sur tes devis ? Commente « GUIDE »." };
    const t = consigneReponse(c, null);
    expect(t).toContain("Tutoiement");
    expect(t).toContain("le lien est dans le premier commentaire");
    expect(t).not.toContain("lien en bio 👆");
    expect(consigneReponse({ ...c, post: "Vous perdez des heures sur vos devis ?" }, null)).toContain("Vouvoiement");
    // Hors LinkedIn, le mot demandé renvoie toujours au lien en bio.
    expect(consigneReponse({ ...c, plateforme: "tiktok" }, null)).toContain("lien en bio 👆");
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
