import { describe, expect, it } from "vitest";
import { controlerPublication, estProchaine, langueProbable } from "./controle-qualite";

describe("estProchaine", () => {
  const maintenant = Date.parse("2026-10-19T05:00:00Z");
  it("garde ce qui part dans les 24 h, retard compris", () => {
    expect(estProchaine("2026-10-19T16:30:00Z", maintenant)).toBe(true);
    expect(estProchaine("2026-10-19T04:00:00Z", maintenant)).toBe(true);
    expect(estProchaine("2026-10-20T06:00:00Z", maintenant)).toBe(false);
    expect(estProchaine(null, maintenant)).toBe(false);
  });
});

// Textes réels publiés par l'agent.
const FR = "Marre de chiffrer vos devis le soir après le chantier ? Avec BTP Ecosystem, une photo du chantier suffit pour générer votre devis grâce à l'IA. Essai gratuit : lien sur notre page. #BTP #DevisIA";
const DE = "Schluss mit verlorenen Notizen und unbezahlter Mehrarbeit auf der Baustelle. Jetzt BTP Ecosystem testen: https://www.btp-ecosystem.com/ #handwerk #baustelle";
const EN = "Nothing costs more than trades standing idle waiting for materials. Map delivery dates against your team schedule with BTP Ecosystem. How do you handle delivery delays?";
const IT = "Modificare i piani all'ultimo secondo significa bloccare le squadre e sprecare ordini già pianificati. Anticipa ogni fabbisogno ed evita fermi cantiere inutili: prova BTP Ecosystem su https://www.btp-ecosystem.com/";
const PT = "Acaba com as surpresas no fim dos trabalhos e organiza a tua gestão. Passa ao plano Pro BTP Ecosystem a 31 euros por mês em pagamento anual.";
const ES = "¿Harto de que el electricista llegue cuando el albañil aún no ha terminado? Con el planning Gantt de BTP Ecosystem, coordinas a todos los gremios en un solo lugar para evitar retrasos y solapamientos en la obra.";

describe("langueProbable", () => {
  it("reconnaît les langues des posts de l'agent", () => {
    expect(langueProbable(FR)).toBe("fr");
    expect(langueProbable(DE)).toBe("de");
    expect(langueProbable(EN)).toBe("en");
    expect(langueProbable(IT)).toBe("it");
    expect(langueProbable(PT)).toBe("pt");
    expect(langueProbable(ES)).toBe("es");
  });

  it("ne tranche pas sur un texte trop court", () => {
    expect(langueProbable("BTP Ecosystem #BTP")).toBeNull();
  });

  it("reconnaît le français des posts courts", () => {
    expect(langueProbable("Fini les devis le soir au lieu d'être en famille. Avec BTP Ecosystem, une photo de chantier suffit. Essayez gratuitement, lien en bio !")).toBe("fr");
  });
});

describe("controlerPublication", () => {
  const maintenant = Date.parse("2026-10-19T12:00:00Z");
  const base = { plateforme: "instagram", titre: "Devis du soir : une photo suffit", marche: "fr-FR", texte: FR };

  it("laisse passer un post français neuf", () => {
    expect(controlerPublication(base, [], maintenant)).toEqual([]);
  });

  it("bloque un texte vide", () => {
    expect(controlerPublication({ ...base, texte: null }, [], maintenant)).toEqual(["texte vide ou presque vide"]);
  });

  it("bloque un post allemand sur un compte français", () => {
    expect(controlerPublication({ ...base, texte: DE }, [], maintenant)).toEqual(["texte en allemand au lieu du français"]);
  });

  it("accepte l'italien pour un marché italien", () => {
    expect(controlerPublication({ ...base, marche: "it-IT", texte: IT }, [], maintenant)).toEqual([]);
  });

  it("bloque le même sujet sur le même réseau dans les 3 jours", () => {
    const recentes = [{ plateforme: "instagram", titre: "Devis du soir — une photo suffit !", publiee_le: "2026-10-17T16:30:00Z" }];
    expect(controlerPublication(base, recentes, maintenant)).toHaveLength(1);
  });

  it("accepte le même sujet sur un autre réseau ou plus tard", () => {
    const recentes = [
      { plateforme: "tiktok", titre: base.titre, publiee_le: "2026-10-19T10:00:00Z" },
      { plateforme: "instagram", titre: base.titre, publiee_le: "2026-10-12T10:00:00Z" },
    ];
    expect(controlerPublication(base, recentes, maintenant)).toEqual([]);
  });
});

describe("controlerPublication — mode croissance", () => {
  it("bloque les promesses intenables seulement en mode croissance", () => {
    const p = { plateforme: "instagram", titre: "Factures", marche: "fr-FR", texte: "Vos factures 100 % conformes, sans aucun risque pour votre entreprise et vos clients." };
    expect(controlerPublication({ ...p, croissance: true }, [])).toEqual(["promesse impossible à tenir (promesse « 100 % », « sans risque »)"]);
    expect(controlerPublication(p, [])).toEqual([]);
  });
});
