import { describe, expect, it } from "vitest";
import { avecDesinscription, consigneMessage, estARelancer, liensContact, lireMessage, numeroInternational, type ProspectARediger } from "./prospection";

const prospect: ProspectARediger = {
  id: "x",
  nom: "Boulangerie Martin",
  entreprise: "Boulangerie Martin",
  categorie: "Boulangeries",
  adresse: "3 rue Neuve 69001 Lyon",
  source: null,
  email: "contact@martin.fr",
  telephone: "04 78 00 00 00",
  site: null,
  statut: "nouveau",
  genre: "premier",
  dernier_contact_at: null,
  dernier_message: null,
  contexte: "Marque : Agent IA Live\nOffre : publications automatiques",
};

describe("prospection", () => {
  it("la consigne cite le métier, l'offre et interdit la mention ajoutée automatiquement", () => {
    const c = consigneMessage(prospect, "email");
    expect(c).toContain("Métier : Boulangeries");
    expect(c).toContain("Offre : publications automatiques");
    expect(c).toContain("objet");
    expect(consigneMessage({ ...prospect, genre: "relance", dernier_message: "Premier texte" }, "message")).toContain("Premier texte");
  });

  it("lit le JSON de l'IA et ajoute la désinscription", () => {
    const b = lireMessage('Voici : {"objet": "Vos réseaux", "texte": "Bonjour Madame, …"}', "email", "premier");
    expect(b.objet).toBe("Vos réseaux");
    expect(b.texte).toMatch(/Répondez simplement « STOP »/);
    const m = lireMessage("Bonjour, petit message.", "message", "relance");
    expect(m).toMatchObject({ objet: "", genre: "relance" });
    expect(m.texte).toMatch(/STOP/);
  });

  it("n'ajoute pas deux fois la mention", () => {
    expect(avecDesinscription("Bonjour.\nRépondez STOP pour ne plus être contacté.", "message")).toBe("Bonjour.\nRépondez STOP pour ne plus être contacté.");
  });

  it("normalise les numéros français", () => {
    expect(numeroInternational("04 78 00 00 00")).toBe("33478000000");
    expect(numeroInternational("+33 6 12 34 56 78")).toBe("33612345678");
    expect(numeroInternational("12")).toBeNull();
  });

  it("prépare des liens qui ouvrent l'application avec le texte, sans envoyer", () => {
    const liens = liensContact(prospect, { objet: "Vos réseaux", texte: "Bonjour & merci" });
    expect(liens.map((l) => l.type)).toEqual(["email", "whatsapp", "sms", "telephone"]);
    expect(liens[0].href).toBe("mailto:contact@martin.fr?subject=Vos%20r%C3%A9seaux&body=Bonjour%20%26%20merci");
    expect(liens[1].href).toBe("https://wa.me/33478000000?text=Bonjour%20%26%20merci");
  });

  it("ignore une adresse e-mail suspecte", () => {
    expect(liensContact({ email: "a@b.fr?bcc=x@y.fr", telephone: null }, null)).toEqual([]);
  });

  it("repère les prospects à relancer", () => {
    const maintenant = new Date("2026-09-30T12:00:00Z");
    const p = { statut: "contacte", dernier_contact_at: "2026-09-20T12:00:00Z" };
    expect(estARelancer(p, 7, maintenant)).toBe(true);
    expect(estARelancer(p, 14, maintenant)).toBe(false);
    expect(estARelancer({ ...p, brouillon: { texte: "…" } }, 7, maintenant)).toBe(false);
    expect(estARelancer({ ...p, statut: "a_repondu" }, 7, maintenant)).toBe(false);
  });
});

describe("consigne : certification RGE", () => {
  it("demande de mentionner la certification RGE seulement si elle figure sur la fiche", () => {
    const consigne = consigneMessage(
      {
        id: "1",
        nom: "Martin Plomberie",
        entreprise: "Martin Plomberie",
        categorie: "Plombiers",
        adresse: null,
        site: null,
        infos: "SIRET 412 660 508 00257 · créée en 1997 · certifiée RGE",
        contexte: "BTP Ecosystem",
        genre: "premier",
        dernier_message: null,
      } as never,
      "email",
    );
    expect(consigne).toContain("certifiée RGE");
    expect(consigne).toMatch(/sinon, ne parle pas de RGE/);
  });
});
