import { describe, expect, it } from "vitest";
import { consigneConversation, lireReponseConversation, nettoyerMessage } from "./conversation";

describe("consigneConversation", () => {
  it("donne la méthode en cinq étapes et interdit les inventions", () => {
    const c = consigneConversation({ contexte: "Marque : BTP Ecosystem", conversation: "Lui : Bonjour, merci pour l'ajout." });
    for (const e of ["ouverture", "diagnostic", "lien", "proposition", "sortie"]) expect(c).toContain(e);
    expect(c).toContain("n'invente aucun fait");
    expect(c).toContain("assistant IA");
    expect(c).toContain("Marque : BTP Ecosystem");
    expect(c).toContain("Bonjour, merci pour l'ajout.");
  });

  it("signale les captures d'écran et garde la fin d'une longue conversation", () => {
    const longue = "début-" + "x".repeat(20_000) + "-fin";
    const c = consigneConversation({ contexte: null, conversation: longue, avecCaptures: true });
    expect(c).toContain("captures d'écran jointes");
    expect(c).toContain("-fin");
    expect(c).not.toContain("début-");
  });

  it("sans texte, renvoie vers les captures", () => {
    expect(consigneConversation({ contexte: null, conversation: "", avecCaptures: true })).toContain("(voir les captures)");
  });

  it("transmet les précisions de l'utilisateur", () => {
    expect(consigneConversation({ contexte: null, conversation: "x", precisions: "architecte à Lyon" })).toContain("architecte à Lyon");
  });
});

describe("lireReponseConversation", () => {
  it("lit la réponse JSON, même entourée de texte", () => {
    const r = lireReponseConversation('Voici :\n{"etape": "Diagnostic", "message": "« Merci pour ton retour ! Tu reprends chaque échange à la main ? »", "pourquoi": "Il vient de répondre", "suite": "S\'il dit oui, chiffrer."}');
    expect(r?.etape).toBe("diagnostic");
    expect(r?.message).toBe("Merci pour ton retour ! Tu reprends chaque échange à la main ?");
    expect(r?.pourquoi).toBe("Il vient de répondre");
  });

  it("accepte une étape accentuée ou inconnue", () => {
    expect(lireReponseConversation('{"etape":"Ouverture","message":"Bonjour Claire, merci pour l\'ajout."}')?.etape).toBe("ouverture");
    expect(lireReponseConversation('{"etape":"autre chose","message":"Bonjour Claire, merci pour l\'ajout."}')?.etape).toBe("diagnostic");
  });

  it("garde le texte brut quand l'IA ne répond pas en JSON", () => {
    expect(lireReponseConversation("Merci beaucoup pour ta réponse, très clair !")?.message).toBe("Merci beaucoup pour ta réponse, très clair !");
  });

  it("refuse une réponse vide ou trop courte", () => {
    expect(lireReponseConversation("")).toBeNull();
    expect(lireReponseConversation('{"etape":"lien","message":"ok"}')).toBeNull();
    expect(lireReponseConversation("{ cassé")).toBeNull();
  });
});

describe("nettoyerMessage", () => {
  it("retire guillemets, gras et titres", () => {
    expect(nettoyerMessage('"Salut **toi** !"')).toBe("Salut toi !");
    expect(nettoyerMessage("# Titre\nTexte")).toBe("Titre\nTexte");
  });
});
