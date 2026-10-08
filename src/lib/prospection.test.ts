import { describe, expect, it } from "vitest";
import { avecDesinscription, bilanCampagne, consigneMessage, emailImpersonnel, estAAppeler, estOrganisme, scriptAppel, estARelancer, liensContact, lireMessage, numeroInternational, type ProspectARediger } from "./prospection";

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
  it("par e-mail, l'IA ne signe pas (la fiche est ajoutée automatiquement)", () => {
    expect(consigneMessage(prospect, "email")).toContain("Ne signe pas");
    expect(consigneMessage(prospect, "message")).toContain("Signe avec le nom de notre marque");
  });

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

describe("consigne : architectes", () => {
  it("oriente le message vers la collaboration et l'offre pilote de 3 mois", () => {
    const base = { id: "1", nom: "Cabinet X", entreprise: "Cabinet X", adresse: null, site: null, infos: null, contexte: "BTP Ecosystem", genre: "premier", dernier_message: null };
    const archi = consigneMessage({ ...base, categorie: "Architectes" } as never, "email");
    expect(archi).toContain("COLLABORATION");
    expect(archi).toContain("Business est offerte pendant 3 mois");
    const plombier = consigneMessage({ ...base, categorie: "Plombiers" } as never, "email");
    expect(plombier).not.toContain("COLLABORATION");
  });
});

describe("suivi de campagne", () => {
  it("compte les prospects du métier visé, par étape", () => {
    const p = (statut: string, categorie: string, email: string | null, email_invalide = false) => ({
      type: "entreprise",
      statut,
      categorie,
      email,
      email_invalide,
    });
    const liste = [
      p("nouveau", "Architectes", "a@b.fr"),
      p("nouveau", "Architectes", null),
      p("nouveau", "Architectes", "x@y.fr", true),
      p("contacte", "Architectes", "c@d.fr"),
      p("relance", "Architectes", "e@f.fr"),
      p("a_repondu", "Architectes", "g@h.fr"),
      p("nouveau", "Plombiers", "p@q.fr"),
      { ...p("nouveau", "Architectes", "i@j.fr"), type: "particulier" },
    ];
    expect(bilanCampagne(liste, "architectes")).toEqual({
      aContacter: 1,
      contactes: 1,
      relances: 1,
      ontRepondu: 1,
      sansEmail: 1,
      enErreur: 1,
    });
    expect(bilanCampagne(liste, null).aContacter).toBe(2);
  });
});

describe("à appeler", () => {
  it("garde les entreprises jamais contactées avec téléphone et sans e-mail", () => {
    const base = { type: "entreprise", statut: "nouveau", telephone: "05 56 00 00 00", email: null };
    expect(estAAppeler(base)).toBe(true);
    expect(estAAppeler({ ...base, email: "a@b.fr" })).toBe(false);
    expect(estAAppeler({ ...base, telephone: null })).toBe(false);
    expect(estAAppeler({ ...base, statut: "contacte" })).toBe(false);
    expect(estAAppeler({ ...base, type: "particulier" })).toBe(false);
  });
  it("adapte la trame d'appel aux architectes", () => {
    expect(scriptAppel("BTP Ecosystem", "Architectes").join(" ")).toContain("3 mois");
    expect(scriptAppel(null, "Plombiers").join(" ")).not.toContain("3 mois");
    expect(scriptAppel("Autre marque", "Architectes").join(" ")).not.toContain("3 mois");
  });
});

describe("adresse impersonnelle (Belgique)", () => {
  it("accepte les boîtes d'entreprise, refuse les adresses nominatives", () => {
    for (const e of ["contact@atelier.be", "info@archi.be", "bureau-liege@x.be", "secretariat@x.be", "studio.ab@x.be", "a2rc@a2rc.be", "archi@arbredor.be"])
      expect(emailImpersonnel(e)).toBe(true);
    for (const e of ["jean.dupont@archi.be", "marc@x.be", "marc@marc-dupont.be", "", null])
      expect(emailImpersonnel(e)).toBe(false);
  });
  it("demande de ne pas parler de Factur-X hors de France", () => {
    const base = { categorie: "Architectes", genre: "premier", nom: "A", entreprise: "A" } as never;
    expect(consigneMessage({ ...(base as object), pays: "BE" } as never, "email")).toContain("Factur-X");
    expect(consigneMessage({ ...(base as object), pays: "FR" } as never, "email")).not.toContain("hors de France");
  });
});

describe("organismes écartés de la prospection", () => {
  it("CAUE, Maison de l'Architecture, Ordre : pas des cabinets", () => {
    for (const n of ["Maison de l'Architecture", "CAUE d'Alsace", "Conseil d'Architecture, d'Urbanisme et de l'Environnement", "Ordre des architectes", "École nationale supérieure d'architecture de Lyon"])
      expect(estOrganisme(n)).toBe(true);
    for (const n of ["Atelier Lame", "Dumont Legrand Architectes", "Architectes Associés"]) expect(estOrganisme(n)).toBe(false);
  });
});
